import { describe, it, expect } from 'vitest'
import { WatchdogController } from '../../src/lifecycle/watchdogController.js'
import { ShotCoordinatorDO } from '../../src/objects/ShotCoordinatorDO.js'

class MockDurableObjectStorage {
    public store = new Map<string, any>()
    public activeAlarm: number | null = null

    async get(key: string): Promise<any> {
        return this.store.get(key)
    }
    async put(key: string, value: any): Promise<void> {
        this.store.set(key, value)
    }
    async delete(key: string): Promise<void> {
        this.store.delete(key)
    }

    async setAlarm(ms: number): Promise<void> {
        this.activeAlarm = ms
    }
    async deleteAlarm(): Promise<void> {
        this.activeAlarm = null
    }
}

class MockDurableObjectContext {
    public storage = new MockDurableObjectStorage()
    blockConcurrencyWhile(fn: () => Promise<any>): Promise<any> {
        return fn()
    }
}

describe('Watchdog Interruption & Hardware Alarm Disarming Battery (Phase 4)', () => {
    it('INVARIANT 1: Alarm Armed Ceiling Injection schedules alarm within minimal execution delta', async () => {
        const mockCtx = new MockDurableObjectContext()
        const nowBefore = Date.now()

        await WatchdogController.armWatchdog(mockCtx, 'task-ceiling-001', 10000)
        const nowAfter = Date.now()

        expect(mockCtx.storage.activeAlarm).toBeGreaterThanOrEqual(
            nowBefore + 10000,
        )
        expect(mockCtx.storage.activeAlarm).toBeLessThanOrEqual(
            nowAfter + 10000,
        )

        await WatchdogController.disarmWatchdog(mockCtx, 'task-ceiling-001')
        expect(mockCtx.storage.activeAlarm).toBeNull()
    })

    it('INVARIANT 2: Dangling Alarm Disarm Verification on ABORT ChatOps command', async () => {
        const mockCtx = new MockDurableObjectContext()
        await mockCtx.storage.put('fsm_state', 'RUNNING')
        await mockCtx.storage.put('active_job', {
            taskId: 'shot-running-001',
            artistId: 'artist-01',
            idempotencyKey: 'idemp-01',
            workflowTemplate: 'default.json',
            prompts: {},
            seeds: [42],
            enqueuedAt: Date.now(),
            attemptCount: 1,
            maxAttempts: 3,
        })
        await mockCtx.storage.put('ledger_chain', [
            {
                blockHash: 'genesis',
                timestampMs: Date.now(),
                eventType: 'TASK_ENQUEUED',
                metadata: { taskId: 'shot-running-001' },
            },
        ])
        await mockCtx.storage.setAlarm(Date.now() + 30000)

        const activeCoordinator = new ShotCoordinatorDO(mockCtx as any, {})
        ;(activeCoordinator as any).chatOpsGateway.interceptAndAuthenticate =
            async () => ({
                authenticated: true,
                rawBody: JSON.stringify({
                    action: 'ABORT',
                    taskId: 'shot-running-001',
                    operatorId: 'director_jules',
                }),
            })

        await new Promise((r) => setTimeout(r, 10))

        const res = await activeCoordinator.fetch(
            new Request('https://do.internal/chatops/command', {
                method: 'POST',
                body: JSON.stringify({
                    action: 'ABORT',
                    taskId: 'shot-running-001',
                    operatorId: 'director_jules',
                }),
            }),
        )

        expect(res.status).toBe(200)
        const data = (await res.json()) as any
        expect(data.aborted).toBe(true)

        // Storage assertions
        expect(mockCtx.storage.activeAlarm).toBeNull()
        const fsmState = await mockCtx.storage.get('fsm_state')
        expect(fsmState).toBe('ABORTED')
        const activeJob = await mockCtx.storage.get('active_job')
        expect(activeJob).toBeNull()
    })

    it('INVARIANT 3: Race Condition Collision (The Phantom Alarm) drops execution without ledger mutations', async () => {
        const mockCtx = new MockDurableObjectContext()
        const initialLedger = [
            {
                blockHash: 'genesis_block',
                timestampMs: Date.now(),
                eventType: 'TASK_ENQUEUED',
                metadata: { taskId: 'shot-race-002' },
            },
        ]

        await mockCtx.storage.put('fsm_state', 'ABORTED')
        await mockCtx.storage.put('active_job', {
            taskId: 'shot-race-002',
            artistId: 'artist-01',
            idempotencyKey: 'idemp-02',
            workflowTemplate: 'default.json',
            prompts: {},
            seeds: [42],
            enqueuedAt: Date.now(),
            attemptCount: 1,
            maxAttempts: 3,
        })
        await mockCtx.storage.put('ledger_chain', initialLedger)
        await mockCtx.storage.setAlarm(Date.now() - 100)

        const coordinator = new ShotCoordinatorDO(mockCtx as any, {})
        await new Promise((r) => setTimeout(r, 10))

        // Trigger phantom alarm
        await coordinator.alarm()

        // Alarm deleted
        expect(mockCtx.storage.activeAlarm).toBeNull()

        // State not corrupted
        const fsmState = await mockCtx.storage.get('fsm_state')
        expect(fsmState).toBe('ABORTED')

        // Ledger untouched
        const ledgerChain = (await mockCtx.storage.get('ledger_chain')) || []
        expect(ledgerChain.length).toBe(1)
        expect(ledgerChain[0].eventType).toBe('TASK_ENQUEUED')
    })

    it('INVARIANT 4: Empty Alarm Drop Safety drops cleanly without throwing when activeJob is null', async () => {
        const mockCtx = new MockDurableObjectContext()
        await mockCtx.storage.put('fsm_state', 'PENDING')
        await mockCtx.storage.put('active_job', null)
        await mockCtx.storage.setAlarm(Date.now() - 50)

        const coordinator = new ShotCoordinatorDO(mockCtx as any, {})
        await new Promise((r) => setTimeout(r, 10))

        // Trigger alarm when no job is active
        await expect(coordinator.alarm()).resolves.not.toThrow()
        expect(mockCtx.storage.activeAlarm).toBeNull()

        const fsmState = await mockCtx.storage.get('fsm_state')
        expect(fsmState).toBe('PENDING')
    })

    it('INVARIANT 5: Attempt Budget Escalation Routing differentiates RETRY_REQUIRED and DLQ_REQUIRED', async () => {
        // 5A: attemptCount: 1, maxAttempts: 3 -> RETRY_REQUIRED
        const mockCtxA = new MockDurableObjectContext()
        await mockCtxA.storage.put('fsm_state', 'RUNNING')
        await mockCtxA.storage.put('current_epoch', 1)
        await mockCtxA.storage.put('active_job', {
            taskId: 'task-retry-001',
            artistId: 'artist-retry',
            idempotencyKey: 'idemp-retry',
            workflowTemplate: 'default.json',
            prompts: {},
            seeds: [42],
            enqueuedAt: Date.now(),
            attemptCount: 1,
            maxAttempts: 3,
        })
        await mockCtxA.storage.put('ledger_chain', [
            {
                blockHash: 'genesis',
                timestampMs: Date.now(),
                eventType: 'TASK_ENQUEUED',
                metadata: { taskId: 'task-retry-001' },
            },
        ])
        await mockCtxA.storage.setAlarm(Date.now() + 1000)

        const coordinatorA = new ShotCoordinatorDO(mockCtxA as any, {})
        await new Promise((r) => setTimeout(r, 10))

        await coordinatorA.alarm()

        expect(mockCtxA.storage.activeAlarm).toBeNull()
        const stateA = await mockCtxA.storage.get('fsm_state')
        expect(stateA).toBe('RETRYING')
        const epochA = await mockCtxA.storage.get('current_epoch')
        expect(epochA).toBe(2)
        const activeJobA = await mockCtxA.storage.get('active_job')
        expect(activeJobA).toBeNull()
        const chainA = await mockCtxA.storage.get('ledger_chain')
        expect(chainA[chainA.length - 1].eventType).toBe(
            'WATCHDOG_TIMEOUT_REQUEUE',
        )

        // 5B: attemptCount: 2, maxAttempts: 3 -> DLQ_REQUIRED
        const mockCtxB = new MockDurableObjectContext()
        await mockCtxB.storage.put('fsm_state', 'RUNNING')
        await mockCtxB.storage.put('current_epoch', 2)
        await mockCtxB.storage.put('active_job', {
            taskId: 'task-dlq-001',
            artistId: 'artist-dlq',
            idempotencyKey: 'idemp-dlq',
            workflowTemplate: 'default.json',
            prompts: {},
            seeds: [42],
            enqueuedAt: Date.now(),
            attemptCount: 2,
            maxAttempts: 3,
        })
        await mockCtxB.storage.put('ledger_chain', [
            {
                blockHash: 'genesis',
                timestampMs: Date.now(),
                eventType: 'TASK_ENQUEUED',
                metadata: { taskId: 'task-dlq-001' },
            },
        ])
        await mockCtxB.storage.setAlarm(Date.now() + 1000)

        const coordinatorB = new ShotCoordinatorDO(mockCtxB as any, {})
        await new Promise((r) => setTimeout(r, 10))

        await coordinatorB.alarm()

        expect(mockCtxB.storage.activeAlarm).toBeNull()
        const stateB = await mockCtxB.storage.get('fsm_state')
        expect(stateB).toBe('DLQ')
        const activeJobB = await mockCtxB.storage.get('active_job')
        expect(activeJobB).toBeNull()
        const chainB = await mockCtxB.storage.get('ledger_chain')
        expect(chainB[chainB.length - 1].eventType).toBe('CIRCUIT_BREAKER_DLQ')
    })

    it('INVARIANT 6: Deterministic ASCII Telemetry Logs adhere strictly to 7-bit ASCII constraints', async () => {
        const logs: string[] = []
        const originalLog = console.log
        const originalWarn = console.warn
        const originalError = console.error

        console.log = (...args: any[]) => {
            logs.push(args.join(' '))
            originalLog(...args)
        }
        console.warn = (...args: any[]) => {
            logs.push(args.join(' '))
            originalWarn(...args)
        }
        console.error = (...args: any[]) => {
            logs.push(args.join(' '))
            originalError(...args)
        }

        try {
            const mockCtx = new MockDurableObjectContext()
            await WatchdogController.armWatchdog(mockCtx, 'ascii-test', 5000)
            await WatchdogController.disarmWatchdog(mockCtx, 'ascii-test')
            WatchdogController.evaluateAlarm(null, 'PENDING')
            WatchdogController.evaluateAlarm(
                {
                    taskId: 'ascii-test',
                    artistId: 'a',
                    idempotencyKey: 'k',
                    workflowTemplate: 'w',
                    prompts: {},
                    seeds: [],
                    enqueuedAt: 0,
                    attemptCount: 0,
                    maxAttempts: 3,
                },
                'ABORTED',
            )

            expect(logs.length).toBeGreaterThan(0)
            for (const msg of logs) {
                // Assert every character is 7-bit ASCII (code <= 127)
                for (let i = 0; i < msg.length; i++) {
                    expect(msg.charCodeAt(i)).toBeLessThanOrEqual(127)
                }
            }
        } finally {
            console.log = originalLog
            console.warn = originalWarn
            console.error = originalError
        }
    })
})
