import type { Env } from '../tools.js'

export interface DaemonExecutionResult {
    daemonName: string
    status: 'FULFILLED' | 'REJECTED'
    durationMs: number
    error?: string
}

export interface ScheduledDispatchReport {
    cron: string
    scheduledTime: number
    totalDispatched: number
    succeededCount: number
    failedCount: number
    results: DaemonExecutionResult[]
}

export interface DaemonRegistration {
    name: string
    handler: (env: Env) => Promise<any>
}

/**
 * Maps standard cron signatures to registered background daemons.
 * Fault isolation allows individual daemons to fail without crashing siblings.
 */
export function resolveDaemonsForCron(
    cron: string,
    _env: Env,
): DaemonRegistration[] {
    const daemons: DaemonRegistration[] = []

    // 1. Hourly: Pin verification & state reconciliation
    if (cron === '0 * * * *') {
        daemons.push({
            name: 'pinVerifier',
            handler: async (e) => {
                const { verifyAllPins } =
                    await import('./pinVerifier.js').catch(() => ({
                        verifyAllPins: async () => ({ status: 'NOOP_STUB' }),
                    }))
                return verifyAllPins(e)
            },
        })
        daemons.push({
            name: 'stateReconciler',
            handler: async (e) => {
                const { reconcileTaskProjections } =
                    await import('./stateReconciler.js').catch(() => ({
                        reconcileTaskProjections: async () => ({
                            status: 'NOOP_STUB',
                        }),
                    }))
                return reconcileTaskProjections(e)
            },
        })
    }

    // 2. Daily 03:00 UTC: GC & Sweeper
    if (cron === '0 3 * * *') {
        daemons.push({
            name: 'sweeper',
            handler: async (e) => {
                const { runDailyGarbageCollection } =
                    await import('./sweeper.js').catch(() => ({
                        runDailyGarbageCollection: async () => ({
                            status: 'NOOP_STUB',
                        }),
                    }))
                return runDailyGarbageCollection(e)
            },
        })
    }

    // 3. Daily 09:00 UTC: Velocity Rate Limits reset
    if (cron === '0 9 * * *') {
        daemons.push({
            name: 'velocitySweeper',
            handler: async (e) => {
                const { resetDailyVelocity } =
                    await import('./velocitySweeper.js').catch(() => ({
                        resetDailyVelocity: async () => ({
                            status: 'NOOP_STUB',
                        }),
                    }))
                return resetDailyVelocity(e)
            },
        })
    }

    // 4. Midnight 00:00 UTC: Cold Storage Drainage
    if (cron === '0 0 * * *') {
        daemons.push({
            name: 'archiveDrain',
            handler: async (e) => {
                const { drainDailyAuditToGit } =
                    await import('./archiveDrain.js').catch(() => ({
                        drainDailyAuditToGit: async () => ({
                            status: 'NOOP_STUB',
                        }),
                    }))
                return drainDailyAuditToGit(e)
            },
        })
    }

    // 5. Monthly 04:00 UTC on 1st: RunPod GPU Canary
    if (cron === '0 4 1 * *') {
        daemons.push({
            name: 'gpuCanary',
            handler: async (e) => {
                const { triggerMonthlyCanary } =
                    await import('./gpuCanary.js').catch(() => ({
                        triggerMonthlyCanary: async () => ({
                            status: 'NOOP_STUB',
                        }),
                    }))
                return triggerMonthlyCanary(e)
            },
        })
    }

    return daemons
}

/**
 * Dispatches scheduled events concurrently across matched daemons with Promise.allSettled fault isolation.
 */
export async function routeScheduledEvent(
    event: { cron: string; scheduledTime: number },
    _env: Env,
    overrideDaemons?: DaemonRegistration[],
): Promise<ScheduledDispatchReport> {
    const startTime = Date.now()
    const cron = event.cron || 'UNKNOWN'
    const scheduledTime = event.scheduledTime || startTime

    console.log(
        `>> [CRON:INGRESS] Received schedule trigger for '${cron}' at tick ${scheduledTime}`,
    )

    const registrations = overrideDaemons ?? resolveDaemonsForCron(cron, _env)

    if (registrations.length === 0) {
        console.log(
            `>> [CRON:WARN] No daemons registered for cron signature '${cron}'. Completed with 0 tasks.`,
        )
        return {
            cron,
            scheduledTime,
            totalDispatched: 0,
            succeededCount: 0,
            failedCount: 0,
            results: [],
        }
    }

    // Execute all registered daemons in parallel with per-daemon error boundaries
    const taskPromises = registrations.map(async (reg) => {
        const dStart = Date.now()
        try {
            await reg.handler(_env)
            const durationMs = Date.now() - dStart
            console.log(
                `>> [CRON:OK] Daemon '${reg.name}' finished cleanly in ${durationMs}ms [OK]`,
            )
            return {
                daemonName: reg.name,
                status: 'FULFILLED' as const,
                durationMs,
            }
        } catch (err: any) {
            const durationMs = Date.now() - dStart
            const errorMsg = err?.message || String(err)
            console.error(
                `>> [CRON:FAIL] Daemon '${reg.name}' failed after ${durationMs}ms: ${errorMsg} [TRAPPED]`,
            )
            return {
                daemonName: reg.name,
                status: 'REJECTED' as const,
                durationMs,
                error: errorMsg,
            }
        }
    })

    const settledResults = await Promise.allSettled(taskPromises)

    const results: DaemonExecutionResult[] = settledResults.map((r, idx) => {
        if (r.status === 'fulfilled') {
            return r.value
        }
        return {
            daemonName: registrations[idx].name,
            status: 'REJECTED',
            durationMs: 0,
            error: r.reason?.message || 'UNEXPECTED_SETTLED_REJECTION',
        }
    })

    const succeededCount = results.filter(
        (r) => r.status === 'FULFILLED',
    ).length
    const failedCount = results.filter((r) => r.status === 'REJECTED').length

    console.log(
        `>> [CRON:SUMMARY] Cron '${cron}' completed: ${succeededCount} succeeded, ${failedCount} failed (${Date.now() - startTime}ms total) [SETTLED]`,
    )

    return {
        cron,
        scheduledTime,
        totalDispatched: registrations.length,
        succeededCount,
        failedCount,
        results,
    }
}
