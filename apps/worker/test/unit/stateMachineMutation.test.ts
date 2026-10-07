import { describe, it, expect, vi } from 'vitest'
import { FairQueue, type ExecutionJob } from '../../src/queue/fairQueue.js'
import { ShotCoordinatorDO } from '../../src/objects/ShotCoordinatorDO.js'
import { generateChatOpsSignature } from '../../src/telemetry/chatOpsAuth.js'

class MockDurableObjectStorage {
    public store = new Map<string, any>()
    public deleteAlarmCallCount = 0

    async get(key: string): Promise<any> {
        return this.store.get(key)
    }
    async put(key: string, value: any): Promise<void> {
        this.store.set(key, value)
    }
    async delete(key: string): Promise<void> {
        this.store.delete(key)
    }
    async setAlarm(): Promise<void> {}
    async deleteAlarm(): Promise<void> {
        this.deleteAlarmCallCount += 1
    }
}

class MockDurableObjectContext {
    public storage = new MockDurableObjectStorage()
    blockConcurrencyWhile(fn: () => Promise<any>): Promise<any> {
        return fn()
    }
    waitUntil(promise: Promise<any>): void {
        promise.catch(() => {})
    }
}

describe('State Machine Mutation & Monotonic Epoch Fencing Battery (Phase 3)', () => {
    it('INVARIANT 1: Queue Artist Anti-Starvation (5 tasks artist_A, 1 task artist_B)', () => {
        const queue = new FairQueue()

        // Enqueue 5 tasks for artist_A
        for (let i = 1; i <= 5; i++) {
            queue.enqueue({
                taskId: `tA_${i}`,
                artistId: 'artist_A',
            } as ExecutionJob)
        }
        // Enqueue 1 task for artist_B
        queue.enqueue({ taskId: 'tB_1', artistId: 'artist_B' } as ExecutionJob)

        // Dequeue first job with null lastArtistId -> yields artist_A
        const first = queue.dequeueNextFair(null)
        expect(first?.artistId).toBe('artist_A')
        expect(first?.taskId).toBe('tA_1')

        // Dequeue next job with lastArtistId 'artist_A' -> yields artist_B to prevent starvation
        const second = queue.dequeueNextFair('artist_A')
        expect(second?.artistId).toBe('artist_B')
        expect(second?.taskId).toBe('tB_1')

        // artist_B was scheduled without having to wait for all 4 remaining artist_A tasks
        expect(queue.size()).toBe(4)
    })

    it('INVARIANT 2: Priority Re-insertion Preemption', () => {
        const queue = new FairQueue()
        queue.enqueue({
            taskId: 'task_1',
            artistId: 'artist_A',
        } as ExecutionJob)
        queue.enqueue({
            taskId: 'task_2',
            artistId: 'artist_B',
        } as ExecutionJob)

        // Preempt with task_3 via requeuePriority
        queue.requeuePriority({
            taskId: 'task_3_priority',
            artistId: 'artist_C',
        } as ExecutionJob)

        const first = queue.dequeueNextFair(null)
        expect(first?.taskId).toBe('task_3_priority')
    })

    it('INVARIANT 3: DLQ Extraction & Attempt Budget Restoration', async () => {
        const mockCtx = new MockDurableObjectContext()

        // Pre-load DO with a DLQ task where attemptCount === maxAttempts
        await mockCtx.storage.put('fsm_state', 'DLQ')
        await mockCtx.storage.put('current_epoch', 5)
        await mockCtx.storage.put('ledger_chain', [
            { blockHash: '00000', eventType: 'GENESIS', payload: {} },
        ])
        await mockCtx.storage.put('active_job', {
            taskId: 'shot-dlq-001',
            attemptCount: 3,
            maxAttempts: 3,
            seeds: [42],
            prompts: { positive: 'old prompt' },
        })

        const testSecret = 'secret_test'
        const coordinator = new ShotCoordinatorDO(mockCtx as any, {
            CHATOPS_SECRET: testSecret,
        })

        const nowSec = Math.floor(Date.now() / 1000)
        const payload = JSON.stringify({
            action: 'OVERRIDE',
            taskId: 'shot-dlq-001',
            operatorId: 'architect_jules',
            positivePrompt: 'A repaired prompt',
            negativePrompt: 'blurry, distorted',
            seed: 9999,
            denoiseStrength: 0.65,
        })
        const sig = await generateChatOpsSignature(payload, nowSec, testSecret)

        const res = await coordinator.fetch(
            new Request('https://do.internal/chatops/command', {
                method: 'POST',
                headers: {
                    'x-chatops-signature': sig,
                    'x-chatops-timestamp': String(nowSec),
                },
                body: payload,
            }),
        )

        expect(res.status).toBe(200)
        const data: any = await res.json()
        expect(data.overridden).toBe(true)
        expect(data.epoch).toBe(6) // Monotonic bump $N \to N+1$

        // Verify DLQ extraction and attempt reset
        const fsmState = await mockCtx.storage.get('fsm_state')
        expect(fsmState).toBe('PENDING')

        const queue = await mockCtx.storage.get('pending_queue')
        expect(queue).toHaveLength(1)
        expect(queue[0].attemptCount).toBe(0) // Attempt budget restored to 0
        expect(queue[0].prompts.positive).toBe('A repaired prompt')
        expect(queue[0].prompts.negative).toBe('blurry, distorted')
        expect(queue[0].prompts.denoiseStrength).toBe(0.65)
        expect(queue[0].seeds).toEqual([9999])
    })

    it('INVARIANT 4: Monotonic Epoch Security Fencing rejects STALE_EPOCH_ZOMBIE', async () => {
        const mockCtx = new MockDurableObjectContext()

        await mockCtx.storage.put('current_epoch', 5)
        await mockCtx.storage.put('ledger_chain', [
            { blockHash: '00000', eventType: 'GENESIS', payload: {} },
        ])
        await mockCtx.storage.put('active_job', {
            taskId: 'shot-running-001',
            attemptCount: 1,
            maxAttempts: 3,
        })

        const testSecret = 'secret_test'
        const coordinator = new ShotCoordinatorDO(mockCtx as any, {
            CHATOPS_SECRET: testSecret,
        })

        // Operator forces OVERRIDE to bump epoch to 6
        const nowSec = Math.floor(Date.now() / 1000)
        const overridePayload = JSON.stringify({
            action: 'OVERRIDE',
            taskId: 'shot-running-001',
            operatorId: 'operator_override',
        })
        const sig = await generateChatOpsSignature(
            overridePayload,
            nowSec,
            testSecret,
        )

        const overrideRes = await coordinator.fetch(
            new Request('https://do.internal/chatops/command', {
                method: 'POST',
                headers: {
                    'x-chatops-signature': sig,
                    'x-chatops-timestamp': String(nowSec),
                },
                body: overridePayload,
            }),
        )
        expect(overrideRes.status).toBe(200)
        const overrideData: any = await overrideRes.json()
        expect(overrideData.epoch).toBe(6)

        // Put an active job so tasks/complete can evaluate
        ;(coordinator as any).activeJob = { taskId: 'shot-running-001' }
        const chainBefore = ((await mockCtx.storage.get('ledger_chain')) || [])
            .length

        // Zombie worker reports completion with stale epoch 5
        const completeRes = await coordinator.fetch(
            new Request('https://do.internal/tasks/complete', {
                method: 'POST',
                body: JSON.stringify({
                    epoch: 5, // Stale!
                    sha256: 'deadbeefcafe',
                }),
            }),
        )

        expect(completeRes.status).toBe(409)
        const completeData: any = await completeRes.json()
        expect(completeData.error).toBe('STALE_EPOCH_ZOMBIE')

        // Confirm ledger length was NOT changed by zombie submission
        const chainAfter = ((await mockCtx.storage.get('ledger_chain')) || [])
            .length
        expect(chainAfter).toBe(chainBefore)
    })

    it('INVARIANT 5: Hardware Alarm Neutralization disarms watchdog on OVERRIDE and ABORT', async () => {
        const mockCtx = new MockDurableObjectContext()
        await mockCtx.storage.put('ledger_chain', [
            { blockHash: '00000', eventType: 'GENESIS', payload: {} },
        ])
        await mockCtx.storage.put('active_job', {
            taskId: 'task-watchdog-001',
            attemptCount: 1,
            maxAttempts: 3,
        })

        const testSecret = 'secret_test'
        const coordinator = new ShotCoordinatorDO(mockCtx as any, {
            CHATOPS_SECRET: testSecret,
        })

        expect(mockCtx.storage.deleteAlarmCallCount).toBe(0)

        // Trigger OVERRIDE
        const nowSec = Math.floor(Date.now() / 1000)
        const overridePayload = JSON.stringify({
            action: 'OVERRIDE',
            taskId: 'task-watchdog-001',
            operatorId: 'operator_test',
        })
        const sigOverride = await generateChatOpsSignature(
            overridePayload,
            nowSec,
            testSecret,
        )

        await coordinator.fetch(
            new Request('https://do.internal/chatops/command', {
                method: 'POST',
                headers: {
                    'x-chatops-signature': sigOverride,
                    'x-chatops-timestamp': String(nowSec),
                },
                body: overridePayload,
            }),
        )

        expect(mockCtx.storage.deleteAlarmCallCount).toBe(1)

        // Trigger ABORT
        const abortPayload = JSON.stringify({
            action: 'ABORT',
            taskId: 'task-watchdog-001',
            operatorId: 'operator_test',
        })
        const sigAbort = await generateChatOpsSignature(
            abortPayload,
            nowSec,
            testSecret,
        )

        await coordinator.fetch(
            new Request('https://do.internal/chatops/command', {
                method: 'POST',
                headers: {
                    'x-chatops-signature': sigAbort,
                    'x-chatops-timestamp': String(nowSec),
                },
                body: abortPayload,
            }),
        )

        expect(mockCtx.storage.deleteAlarmCallCount).toBe(2)
    })

    it('INVARIANT 6: Deterministic ASCII State Logging emitted during operations', async () => {
        const consoleLogSpy = vi.spyOn(console, 'log')
        const consoleWarnSpy = vi.spyOn(console, 'warn')

        const mockCtx = new MockDurableObjectContext()
        await mockCtx.storage.put('current_epoch', 10)
        await mockCtx.storage.put('ledger_chain', [
            { blockHash: '00000', eventType: 'GENESIS', payload: {} },
        ])
        await mockCtx.storage.put('active_job', {
            taskId: 'task-ascii-001',
            attemptCount: 0,
            maxAttempts: 3,
        })

        const testSecret = 'secret_test'
        const coordinator = new ShotCoordinatorDO(mockCtx as any, {
            CHATOPS_SECRET: testSecret,
        })

        const nowSec = Math.floor(Date.now() / 1000)

        // OVERRIDE -> emits >> [MUTATION:OVERRIDE]
        const overridePayload = JSON.stringify({
            action: 'OVERRIDE',
            taskId: 'task-ascii-001',
            operatorId: 'op_ascii',
        })
        const sigOverride = await generateChatOpsSignature(
            overridePayload,
            nowSec,
            testSecret,
        )
        await coordinator.fetch(
            new Request('https://do.internal/chatops/command', {
                method: 'POST',
                headers: {
                    'x-chatops-signature': sigOverride,
                    'x-chatops-timestamp': String(nowSec),
                },
                body: overridePayload,
            }),
        )

        // ABORT -> emits >> [MUTATION:ABORT]
        const abortPayload = JSON.stringify({
            action: 'ABORT',
            taskId: 'task-ascii-001',
            operatorId: 'op_ascii',
        })
        const sigAbort = await generateChatOpsSignature(
            abortPayload,
            nowSec,
            testSecret,
        )
        await coordinator.fetch(
            new Request('https://do.internal/chatops/command', {
                method: 'POST',
                headers: {
                    'x-chatops-signature': sigAbort,
                    'x-chatops-timestamp': String(nowSec),
                },
                body: abortPayload,
            }),
        )

        // Zombie submission -> emits >> [EPOCH_FENCE:BLOCK]
        ;(coordinator as any).activeJob = { taskId: 'task-ascii-001' }
        await coordinator.fetch(
            new Request('https://do.internal/tasks/complete', {
                method: 'POST',
                body: JSON.stringify({
                    epoch: 1, // Stale!
                    sha256: 'deadbeef',
                }),
            }),
        )

        const logs = consoleLogSpy.mock.calls.map((c) => c.join(' '))
        const warns = consoleWarnSpy.mock.calls.map((c) => c.join(' '))
        const allMessages = [...logs, ...warns]

        expect(
            allMessages.some((m) => m.includes('>> [MUTATION:OVERRIDE]')),
        ).toBe(true)
        expect(allMessages.some((m) => m.includes('>> [MUTATION:ABORT]'))).toBe(
            true,
        )
        expect(
            allMessages.some((m) => m.includes('>> [EPOCH_FENCE:BLOCK]')),
        ).toBe(true)

        // Verify pure 7-bit ASCII constraints (no characters > 127)
        for (const msg of allMessages) {
            expect(/^[\x00-\x7F]*$/.test(msg)).toBe(true)
        }

        consoleLogSpy.mockRestore()
        consoleWarnSpy.mockRestore()
    })
})
