export interface ReconciledTaskDetail {
    taskId: string
    d1Status: string
    doStatus: string
    actionTaken: 'ALIGNED' | 'DRAINED_OUTBOX' | 'FORCE_SYNCED' | 'ERROR'
    error?: string
}

export interface ReconciliationReport {
    checkedCount: number
    driftedCount: number
    repairedCount: number
    unrepairableCount: number
    details: ReconciledTaskDetail[]
}

/**
 * Hourly Anti-Entropy Daemon: Scans active D1 task rows and reconciles state with authoritative DOs.
 */
export async function reconcileTaskProjections(
    env: any,
    options: { batchSize?: number } = {},
): Promise<ReconciliationReport> {
    const batchSize = options.batchSize || 50
    const report: ReconciliationReport = {
        checkedCount: 0,
        driftedCount: 0,
        repairedCount: 0,
        unrepairableCount: 0,
        details: [],
    }

    if (!env.DB || !env.REPO_BOT_DO) {
        console.warn(
            '>> [RECONCILER] Bypassed: Missing DB or REPO_BOT_DO bindings.',
        )
        return report
    }

    // 1. Query active, non-terminal tasks from D1 Hot Projection
    const { results } = await env.DB.prepare(
        `SELECT task_id, current_status, current_attempt_number, updated_at_ms
     FROM tasks
     WHERE current_status NOT IN ('MERGED', 'DLQ')
     ORDER BY updated_at_ms ASC
     LIMIT ?`,
    )
        .bind(batchSize)
        .all()

    const tasks = results || []
    report.checkedCount = tasks.length

    for (const row of tasks) {
        const taskId = String(row.task_id)
        const d1Status = String(row.current_status)
        const d1Attempt = Number(row.current_attempt_number)

        try {
            // 2. Fetch authoritative state from ShotCoordinatorDO
            const doId = env.REPO_BOT_DO.idFromName(taskId)
            const stub = env.REPO_BOT_DO.get(doId)

            const ctxRes = await stub.fetch('https://do/fsm/context')
            if (!ctxRes.ok) {
                throw new Error(`DO_FETCH_FAILED: HTTP ${ctxRes.status}`)
            }

            const doData: any = await ctxRes.json()
            const doStatus = String(doData.currentState)
            const doAttempt = Number(doData.context?.attemptCount || 1)
            const pendingOutboxCount = Number(doData.outboxPendingCount || 0)

            const hasDrift =
                d1Status !== doStatus ||
                d1Attempt !== doAttempt ||
                pendingOutboxCount > 0

            if (!hasDrift) {
                report.details.push({
                    taskId,
                    d1Status,
                    doStatus,
                    actionTaken: 'ALIGNED',
                })
                continue
            }

            // Drift detected
            report.driftedCount++
            console.log(
                `>> [RECONCILER] Drift detected on ${taskId}: D1(${d1Status}) vs DO(${doStatus}) [Outbox: ${pendingOutboxCount}]`,
            )

            // 3. Trigger Outbox Drain on DO
            if (pendingOutboxCount > 0) {
                const drainRes = await stub.fetch(
                    'https://do/fsm/outbox/drain',
                    {
                        method: 'POST',
                    },
                )
                if (!drainRes.ok) {
                    throw new Error(`DO_DRAIN_FAILED: HTTP ${drainRes.status}`)
                }
            }

            // 4. Force-Sync verification
            const verifyRes = await stub.fetch('https://do/fsm/context')
            const verifyData: any = await verifyRes.json()
            const reconciledDoStatus = String(verifyData.currentState)

            // Verify D1 state after drain
            const d1Check = await env.DB.prepare(
                'SELECT current_status FROM tasks WHERE task_id = ?',
            )
                .bind(taskId)
                .first()

            if (d1Check && d1Check.current_status === reconciledDoStatus) {
                report.repairedCount++
                report.details.push({
                    taskId,
                    d1Status,
                    doStatus: reconciledDoStatus,
                    actionTaken: 'DRAINED_OUTBOX',
                })
                console.log(
                    `>> [RECONCILER] Successfully repaired ${taskId} -> ${reconciledDoStatus} [OK]`,
                )
            } else {
                // Direct healing fallback if outbox was empty but D1 was stalled
                await env.DB.prepare(
                    `UPDATE tasks
           SET current_status = ?, current_attempt_number = ?, updated_at_ms = ?
           WHERE task_id = ?`,
                )
                    .bind(reconciledDoStatus, doAttempt, Date.now(), taskId)
                    .run()

                report.repairedCount++
                report.details.push({
                    taskId,
                    d1Status,
                    doStatus: reconciledDoStatus,
                    actionTaken: 'FORCE_SYNCED',
                })
                console.log(
                    `>> [RECONCILER] Force-synced D1 projection for ${taskId} -> ${reconciledDoStatus} [OK]`,
                )
            }
        } catch (err: any) {
            report.unrepairableCount++
            report.details.push({
                taskId,
                d1Status,
                doStatus: 'UNKNOWN',
                actionTaken: 'ERROR',
                error: err.message,
            })
            console.error(
                `>> [RECONCILER ERROR] Failed to reconcile ${taskId}:`,
                err.message,
            )
        }
    }

    return report
}
