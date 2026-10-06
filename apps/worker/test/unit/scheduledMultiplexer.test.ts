import { describe, it, expect, vi } from 'vitest'
import {
    routeScheduledEvent,
    resolveDaemonsForCron,
    type DaemonRegistration,
} from '../../src/crons/scheduledRouter.js'
import worker from '../../src/index.js'
import type { Env } from '../../src/tools.js'

describe('Scheduled Event Multiplexer & Fault Isolation Suite (Phase 1)', () => {
    const mockEnv = {
        GITHUB_TOKEN: 'ghp_mock_token_for_testing',
        CLOUDFLARE_ACCOUNT_ID: 'mock_cf_acc_id',
        CLOUDFLARE_API_TOKEN: 'mock_cf_token',
        CLOUDFLARE_AI_GATEWAY: 'mock_gateway',
        AI: {},
    } as unknown as Env

    it('TASK-1.1 & INV-5: Multi-Schedule Exhaustive Coverage (5 schedules, exactly 6 daemons)', () => {
        const cronSchedules = [
            '0 * * * *',
            '0 3 * * *',
            '0 9 * * *',
            '0 0 * * *',
            '0 4 1 * *',
        ]
        let totalCount = 0

        // Hourly: 0 * * * * -> pinVerifier & stateReconciler
        const hourly = resolveDaemonsForCron('0 * * * *', mockEnv)
        expect(hourly.map((d) => d.name)).toEqual([
            'pinVerifier',
            'stateReconciler',
        ])
        totalCount += hourly.length

        // Daily 03:00: 0 3 * * * -> sweeper
        const daily03 = resolveDaemonsForCron('0 3 * * *', mockEnv)
        expect(daily03.map((d) => d.name)).toEqual(['sweeper'])
        totalCount += daily03.length

        // Daily 09:00: 0 9 * * * -> velocitySweeper
        const daily09 = resolveDaemonsForCron('0 9 * * *', mockEnv)
        expect(daily09.map((d) => d.name)).toEqual(['velocitySweeper'])
        totalCount += daily09.length

        // Midnight 00:00: 0 0 * * * -> archiveDrain
        const midnight = resolveDaemonsForCron('0 0 * * *', mockEnv)
        expect(midnight.map((d) => d.name)).toEqual(['archiveDrain'])
        totalCount += midnight.length

        // Monthly 04:00: 0 4 1 * * -> gpuCanary
        const monthly = resolveDaemonsForCron('0 4 1 * *', mockEnv)
        expect(monthly.map((d) => d.name)).toEqual(['gpuCanary'])
        totalCount += monthly.length

        // ASSERTION: Every standard string maps to at least one valid daemon
        for (const cron of cronSchedules) {
            const resolved = resolveDaemonsForCron(cron, mockEnv)
            expect(resolved.length).toBeGreaterThanOrEqual(1)
        }

        // ASSERTION: Total registered daemon count across the 5 schedules is exactly 6
        expect(totalCount).toBe(6)

        // Unrecognized schedule -> empty array
        const unmapped = resolveDaemonsForCron('*/5 * * * *', mockEnv)
        expect(unmapped).toEqual([])
    })

    it('TASK-1.2: executes matched daemons concurrently and reports status cleanly', async () => {
        const pinMock = vi.fn().mockResolvedValue({ status: 'OK' })
        const reconcileMock = vi.fn().mockResolvedValue({ status: 'REPAIRED' })

        const customDaemons: DaemonRegistration[] = [
            { name: 'mockPin', handler: pinMock },
            { name: 'mockReconcile', handler: reconcileMock },
        ]

        const report = await routeScheduledEvent(
            { cron: '0 * * * *', scheduledTime: Date.now() },
            mockEnv,
            customDaemons,
        )

        expect(report.totalDispatched).toBe(2)
        expect(report.succeededCount).toBe(2)
        expect(report.failedCount).toBe(0)
        expect(pinMock).toHaveBeenCalledTimes(1)
        expect(reconcileMock).toHaveBeenCalledTimes(1)
    })

    it('TASK-1.2 & INV-1: Sibling Fault Containment (The Failing Daemon Trap)', async () => {
        // Under schedule "0 * * * *", inject synthetic error into pinVerifier while stateReconciler succeeds
        const failingDaemon = vi
            .fn()
            .mockRejectedValue(new Error('NETWORK_TIMEOUT_GITHUB_API'))
        const healthyDaemon = vi.fn().mockResolvedValue({ reconciled: 5 })

        const customDaemons: DaemonRegistration[] = [
            { name: 'pinVerifier', handler: failingDaemon },
            { name: 'stateReconciler', handler: healthyDaemon },
        ]

        // ASSERTION: routeScheduledEvent resolves cleanly without throwing an unhandled exception
        const report = await routeScheduledEvent(
            { cron: '0 * * * *', scheduledTime: Date.now() },
            mockEnv,
            customDaemons,
        )

        // ASSERTION: report.succeededCount === 1 and report.failedCount === 1
        expect(report.totalDispatched).toBe(2)
        expect(report.succeededCount).toBe(1)
        expect(report.failedCount).toBe(1)

        // ASSERTION: stateReconciler status is 'FULFILLED'; pinVerifier status is 'REJECTED'
        const failResult = report.results.find(
            (r) => r.daemonName === 'pinVerifier',
        )
        const passResult = report.results.find(
            (r) => r.daemonName === 'stateReconciler',
        )

        expect(failResult?.status).toBe('REJECTED')
        expect(failResult?.error).toContain('NETWORK_TIMEOUT_GITHUB_API')
        expect(passResult?.status).toBe('FULFILLED')
    })

    it('TASK-1.2 & INV-3: Unmapped Cron Signature No-Op', async () => {
        const report = await routeScheduledEvent(
            { cron: '9 9 9 9 9', scheduledTime: Date.now() },
            mockEnv,
        )

        expect(report.totalDispatched).toBe(0)
        expect(report.succeededCount).toBe(0)
        expect(report.failedCount).toBe(0)
        expect(report.results).toEqual([])
    })

    it('TASK-1.3 & INV-2: Non-Blocking Execution Delegation Assertion via worker.scheduled', async () => {
        let capturedPromise: Promise<any> | null = null
        const mockCtx = {
            waitUntil: (promise: Promise<any>) => {
                capturedPromise = promise
            },
        }

        const controller = { cron: '0 3 * * *', scheduledTime: 123456789 }

        // Invoke worker.scheduled entrypoint directly
        const returnVal = worker.scheduled(controller, mockEnv, mockCtx)

        // ASSERTION: scheduled(...) returns a resolved Promise synchronously/immediately
        expect(returnVal).toBeInstanceOf(Promise)
        await expect(returnVal).resolves.toBeUndefined()

        // ASSERTION: The captured promise passed to ctx.waitUntil is non-null and resolves to a valid ScheduledDispatchReport
        expect(capturedPromise).not.toBeNull()
        const report: any = await capturedPromise
        expect(report).toBeDefined()
        expect(report.cron).toBe('0 3 * * *')
        expect(report.scheduledTime).toBe(123456789)
        expect(typeof report.totalDispatched).toBe('number')
        expect(typeof report.succeededCount).toBe('number')
        expect(typeof report.failedCount).toBe('number')
        expect(Array.isArray(report.results)).toBe(true)
    })

    it('INV-4: Timing Metric Non-Negativity across dispatched daemons', async () => {
        const fastDaemon = vi.fn().mockImplementation(async () => {
            await new Promise((resolve) => setTimeout(resolve, 5))
            return { ok: true }
        })

        const customDaemons: DaemonRegistration[] = [
            { name: 'timedDaemon', handler: fastDaemon },
        ]

        const report = await routeScheduledEvent(
            { cron: '0 * * * *', scheduledTime: Date.now() },
            mockEnv,
            customDaemons,
        )

        expect(report.results).toHaveLength(1)
        const res = report.results[0]
        // ASSERTION: durationMs is an integer >= 0
        expect(Number.isInteger(res.durationMs)).toBe(true)
        expect(res.durationMs).toBeGreaterThanOrEqual(0)
    })
})
