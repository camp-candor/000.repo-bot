import { describe, it, expect, vi } from 'vitest'
import {
    routeScheduledEvent,
    resolveDaemonsForCron,
    type DaemonRegistration,
} from '../../src/crons/scheduledRouter.js'
import type { Env } from '../../src/tools.js'

describe('Scheduled Event Multiplexer & Fault Isolation Suite (Phase 1)', () => {
    const mockEnv = {
        GITHUB_TOKEN: 'ghp_mock_token_for_testing',
        CLOUDFLARE_ACCOUNT_ID: 'mock_cf_acc_id',
        CLOUDFLARE_API_TOKEN: 'mock_cf_token',
        CLOUDFLARE_AI_GATEWAY: 'mock_gateway',
        AI: {},
    } as unknown as Env

    it('TASK-1.1: resolves correct daemons for defined cron signatures', () => {
        // Hourly: 0 * * * * -> pinVerifier & stateReconciler
        const hourly = resolveDaemonsForCron('0 * * * *', mockEnv)
        expect(hourly.map((d) => d.name)).toEqual([
            'pinVerifier',
            'stateReconciler',
        ])

        // Daily 03:00: 0 3 * * * -> sweeper
        const daily03 = resolveDaemonsForCron('0 3 * * *', mockEnv)
        expect(daily03.map((d) => d.name)).toEqual(['sweeper'])

        // Daily 09:00: 0 9 * * * -> velocitySweeper
        const daily09 = resolveDaemonsForCron('0 9 * * *', mockEnv)
        expect(daily09.map((d) => d.name)).toEqual(['velocitySweeper'])

        // Midnight 00:00: 0 0 * * * -> archiveDrain
        const midnight = resolveDaemonsForCron('0 0 * * *', mockEnv)
        expect(midnight.map((d) => d.name)).toEqual(['archiveDrain'])

        // Monthly 04:00: 0 4 1 * * -> gpuCanary
        const monthly = resolveDaemonsForCron('0 4 1 * *', mockEnv)
        expect(monthly.map((d) => d.name)).toEqual(['gpuCanary'])

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

    it('TASK-1.2: traps individual daemon rejections via Promise.allSettled without failing sibling tasks', async () => {
        const failingDaemon = vi
            .fn()
            .mockRejectedValue(new Error('NETWORK_TIMEOUT_GITHUB_API'))
        const healthyDaemon = vi.fn().mockResolvedValue({ reconciled: 5 })

        const customDaemons: DaemonRegistration[] = [
            { name: 'failingDaemon', handler: failingDaemon },
            { name: 'healthyDaemon', handler: healthyDaemon },
        ]

        const report = await routeScheduledEvent(
            { cron: '0 * * * *', scheduledTime: Date.now() },
            mockEnv,
            customDaemons,
        )

        // Assert fault isolation: one failure does not trip the isolate or prevent the sibling from completing
        expect(report.totalDispatched).toBe(2)
        expect(report.succeededCount).toBe(1)
        expect(report.failedCount).toBe(1)

        const failResult = report.results.find(
            (r) => r.daemonName === 'failingDaemon',
        )
        const passResult = report.results.find(
            (r) => r.daemonName === 'healthyDaemon',
        )

        expect(failResult?.status).toBe('REJECTED')
        expect(failResult?.error).toContain('NETWORK_TIMEOUT_GITHUB_API')
        expect(passResult?.status).toBe('FULFILLED')
    })

    it('TASK-1.2: handles unrecognized cron signatures gracefully without throwing errors', async () => {
        const report = await routeScheduledEvent(
            { cron: '9 9 9 9 9', scheduledTime: Date.now() },
            mockEnv,
        )

        expect(report.totalDispatched).toBe(0)
        expect(report.succeededCount).toBe(0)
        expect(report.failedCount).toBe(0)
        expect(report.results).toEqual([])
    })

    it('TASK-1.3: delegates execution safely through ExecutionContext.waitUntil', async () => {
        let capturedPromise: Promise<any> | null = null
        const mockCtx = {
            waitUntil: (promise: Promise<any>) => {
                capturedPromise = promise
            },
        }

        const testDaemon = vi.fn().mockResolvedValue(true)
        const event = { cron: '0 3 * * *', scheduledTime: 123456789 }

        // Simulate Worker scheduled entrypoint execution
        mockCtx.waitUntil(
            routeScheduledEvent(event, mockEnv, [
                { name: 'testDaemon', handler: testDaemon },
            ]),
        )

        expect(capturedPromise).not.toBeNull()
        const result = await capturedPromise
        expect((result as any)!.succeededCount).toBe(1)
        expect(testDaemon).toHaveBeenCalledTimes(1)
    })
})
