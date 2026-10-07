import { describe, it, expect, beforeEach } from 'vitest'
import { FairQueue } from '../../src/queue/fairQueue.js'
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

    async setAlarm(timeMs: number): Promise<void> {
        this.activeAlarm = timeMs
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

describe('Monotonic Epoch Generation & DO Queue Mechanics Battery (Phase 2)', () => {
    let mockCtx: MockDurableObjectContext
    let coordinator: ShotCoordinatorDO

    beforeEach(() => {
        mockCtx = new MockDurableObjectContext()
        coordinator = new ShotCoordinatorDO(mockCtx as any, {})
    })

    it('TASK-2.1: interleaves multi-tenant queue [A, A, A, B] to [A, B, A, A] via tenant round-robin', () => {
        const queue = new FairQueue()

        queue.enqueue({
            taskId: 'shot-A1',
            artistId: 'Artist_Alpha',
            idempotencyKey: 'idemp-1',
            workflowTemplate: 't1',
            prompts: {},
            seeds: [1],
            enqueuedAt: 1000,
            attemptCount: 0,
            maxAttempts: 2,
        })
        queue.enqueue({
            taskId: 'shot-A2',
            artistId: 'Artist_Alpha',
            idempotencyKey: 'idemp-2',
            workflowTemplate: 't1',
            prompts: {},
            seeds: [2],
            enqueuedAt: 1001,
            attemptCount: 0,
            maxAttempts: 2,
        })
        queue.enqueue({
            taskId: 'shot-A3',
            artistId: 'Artist_Alpha',
            idempotencyKey: 'idemp-3',
            workflowTemplate: 't1',
            prompts: {},
            seeds: [3],
            enqueuedAt: 1002,
            attemptCount: 0,
            maxAttempts: 2,
        })
        queue.enqueue({
            taskId: 'shot-B1',
            artistId: 'Artist_Beta',
            idempotencyKey: 'idemp-4',
            workflowTemplate: 't1',
            prompts: {},
            seeds: [4],
            enqueuedAt: 1003,
            attemptCount: 0,
            maxAttempts: 2,
        })

        // First execution pulls FIFO Alpha
        const first = queue.dequeueNextFair(null)
        expect(first?.taskId).toBe('shot-A1')

        // Second execution: last artist was Alpha -> pulls Beta forward!
        const second = queue.dequeueNextFair('Artist_Alpha')
        expect(second?.taskId).toBe('shot-B1')
        expect(second?.artistId).toBe('Artist_Beta')

        // Third execution: last artist was Beta -> pulls remaining Alpha
        const third = queue.dequeueNextFair('Artist_Beta')
        expect(third?.taskId).toBe('shot-A2')

        const fourth = queue.dequeueNextFair('Artist_Alpha')
        expect(fourth?.taskId).toBe('shot-A3')
        expect(queue.size()).toBe(0)
    })

    it('TASK-2.1: falls back gracefully to sequential FIFO throughput when queue belongs to a single artist', () => {
        const queue = new FairQueue()
        for (let i = 1; i <= 3; i++) {
            queue.enqueue({
                taskId: `shot-A${i}`,
                artistId: 'Artist_Solo',
                idempotencyKey: `idemp-solo-${i}`,
                workflowTemplate: 't1',
                prompts: {},
                seeds: [i],
                enqueuedAt: 1000 + i,
                attemptCount: 0,
                maxAttempts: 2,
            })
        }

        const j1 = queue.dequeueNextFair('Artist_Solo')
        expect(j1?.taskId).toBe('shot-A1')

        const j2 = queue.dequeueNextFair('Artist_Solo')
        expect(j2?.taskId).toBe('shot-A2')

        const j3 = queue.dequeueNextFair('Artist_Solo')
        expect(j3?.taskId).toBe('shot-A3')
    })

    it('TASK-2.2: rejects duplicate task submissions with HTTP 409 Conflict without queue pollution', async () => {
        const enq1 = await coordinator.fetch(
            new Request('https://do.internal/enqueue', {
                method: 'POST',
                body: JSON.stringify({
                    taskId: 'shot-01',
                    artistId: 'artist_paris',
                    idempotencyKey: 'idemp-key-01',
                }),
            }),
        )
        expect(enq1.status).toBe(200)
        const enq1Data = (await enq1.json()) as any
        expect(enq1Data.position).toBe(1)

        // Resubmit identical payload with same idempotencyKey
        const dupRes = await coordinator.fetch(
            new Request('https://do.internal/enqueue', {
                method: 'POST',
                body: JSON.stringify({
                    taskId: 'shot-01',
                    artistId: 'artist_paris',
                    idempotencyKey: 'idemp-key-01',
                }),
            }),
        )
        expect(dupRes.status).toBe(409)

        // Resubmit with same taskId but different idempotencyKey
        const dupTaskIdRes = await coordinator.fetch(
            new Request('https://do.internal/enqueue', {
                method: 'POST',
                body: JSON.stringify({
                    taskId: 'shot-01',
                    artistId: 'artist_paris',
                    idempotencyKey: 'idemp-key-different',
                }),
            }),
        )
        expect(dupTaskIdRes.status).toBe(409)

        const stateRes = await coordinator.fetch(
            new Request('https://do.internal/state'),
        )
        const stateData = (await stateRes.json()) as any
        expect(stateData.queueDepth).toBe(1) // Zero duplicate queue pollution
    })

    it('TASK-2.2: enqueues job and increments monotonic epoch on lease claim, rejecting concurrent claims', async () => {
        const enqReq = new Request('https://do.internal/enqueue', {
            method: 'POST',
            body: JSON.stringify({
                taskId: 'shot-01',
                artistId: 'artist_paris',
                idempotencyKey: 'idemp-01',
            }),
        })

        const enqRes = await coordinator.fetch(enqReq)
        expect(enqRes.status).toBe(200)
        const enqData = (await enqRes.json()) as any
        expect(enqData.ok).toBe(true)
        expect(enqData.position).toBe(1)

        // Hardware pull broker claims lease
        const claimReq = new Request('https://do.internal/leases/claim', {
            method: 'POST',
            body: JSON.stringify({ workerId: 'rig2_gpu' }),
        })

        const claimRes = await coordinator.fetch(claimReq)
        expect(claimRes.status).toBe(200)
        const claimData = (await claimRes.json()) as any

        expect(claimData.ok).toBe(true)
        expect(claimData.taskId).toBe('shot-01')
        expect(claimData.epoch).toBe(1) // Monotonic Epoch stamped (0 -> 1)
        expect(mockCtx.storage.activeAlarm).not.toBeNull()

        // Second worker attempts concurrent claim while job is running
        const busyReq = new Request('https://do.internal/leases/claim', {
            method: 'POST',
            body: JSON.stringify({ workerId: 'rig3_gpu' }),
        })
        const busyRes = await coordinator.fetch(busyReq)
        expect(busyRes.status).toBe(200)
        const busyData = (await busyRes.json()) as any
        expect(busyData.ok).toBe(false)
        expect(busyData.busy).toBe(true)
    })

    it('TASK-2.2 & 2.3: watchdog alarm handles transient failure by bumping epoch and requeuing job', async () => {
        await coordinator.fetch(
            new Request('https://do.internal/enqueue', {
                method: 'POST',
                body: JSON.stringify({
                    taskId: 'shot-transient',
                    artistId: 'artist_tokyo',
                    idempotencyKey: 'idemp-transient',
                    maxAttempts: 2,
                }),
            }),
        )

        // Claim job (Epoch 1)
        const claimRes = await coordinator.fetch(
            new Request('https://do.internal/leases/claim', {
                method: 'POST',
                body: JSON.stringify({ workerId: 'rig2_gpu' }),
            }),
        )
        const claimData = (await claimRes.json()) as any
        expect(claimData.epoch).toBe(1)

        // Simulate 30s silence triggering alarm
        await coordinator.alarm()

        // Verify epoch advanced (1 -> 2) to fence out the zombie worker
        const stateRes = await coordinator.fetch(
            new Request('https://do.internal/state'),
        )
        const stateData = (await stateRes.json()) as any
        expect(stateData.currentEpoch).toBe(2)
        expect(stateData.activeJob).toBeNull()
        expect(stateData.queueDepth).toBe(1) // Task returned to pending queue

        // Stale zombie runner attempts to complete under Epoch 1
        const staleCompRes = await coordinator.fetch(
            new Request('https://do.internal/tasks/complete', {
                method: 'POST',
                body: JSON.stringify({
                    taskId: 'shot-transient',
                    epoch: 1,
                    stagingKey:
                        'staging/renders/shot-transient/epoch_1_a8f5b3c2e1d0f4a8b7c9e0d1f2a3b4c5.mp4',
                }),
            }),
        )
        expect(staleCompRes.status).toBe(409) // Stale job is fenced by monotonic epoch
        const staleData = (await staleCompRes.json()) as any
        expect(staleData.fenced).toBe(true)
    })

    it('TASK-2.3: trips poison task circuit breaker into DLQ after exhausting max attempts and clears alarm', async () => {
        await coordinator.fetch(
            new Request('https://do.internal/enqueue', {
                method: 'POST',
                body: JSON.stringify({
                    taskId: 'shot-poison',
                    artistId: 'artist_london',
                    idempotencyKey: 'idemp-poison',
                    maxAttempts: 2,
                }),
            }),
        )

        // Attempt 1 Claim & Expiry
        await coordinator.fetch(
            new Request('https://do.internal/leases/claim', {
                method: 'POST',
                body: JSON.stringify({ workerId: 'rig2_gpu' }),
            }),
        )
        await coordinator.alarm() // attemptCount: 1 < 2 -> Requeues

        // Attempt 2 Claim & Expiry
        await coordinator.fetch(
            new Request('https://do.internal/leases/claim', {
                method: 'POST',
                body: JSON.stringify({ workerId: 'rig2_gpu' }),
            }),
        )
        await coordinator.alarm() // attemptCount: 2 >= 2 -> Quarantines to DLQ

        const stateRes = await coordinator.fetch(
            new Request('https://do.internal/state'),
        )
        const stateData = (await stateRes.json()) as any

        expect(stateData.queueDepth).toBe(0) // Not re-queued
        expect(stateData.activeJob).toBeNull()
        expect(stateData.dlqCount).toBe(1)
        expect(stateData.dlq['shot-poison']).toBeDefined()
        expect(stateData.dlq['shot-poison'].attemptCount).toBe(2)
        expect(stateData.dlq['shot-poison'].errorTrajectoryVector.ruleId).toBe(
            'MAX_ATTEMPTS_EXHAUSTED',
        )
        expect(mockCtx.storage.activeAlarm).toBeNull() // Hardware alarm deleted
    })

    it('TASK-2.2: rejects zombie completion and heartbeat writes with HTTP 409 Conflict when presented epoch is stale', async () => {
        await coordinator.fetch(
            new Request('https://do.internal/enqueue', {
                method: 'POST',
                body: JSON.stringify({
                    taskId: 'shot-fenced',
                    artistId: 'artist_berlin',
                    idempotencyKey: 'idemp-fenced',
                }),
            }),
        )

        // Worker 1 claims job under Epoch 1
        await coordinator.fetch(
            new Request('https://do.internal/leases/claim', {
                method: 'POST',
                body: JSON.stringify({ workerId: 'rig2_gpu' }),
            }),
        )

        // Partition occurs; heartbeat times out; alarm bumps epoch to 2 and requeues job
        await coordinator.alarm()

        // Worker 2 claims job under Epoch 3
        const claim2 = await coordinator.fetch(
            new Request('https://do.internal/leases/claim', {
                method: 'POST',
                body: JSON.stringify({ workerId: 'rig2_gpu_2' }),
            }),
        )
        const claim2Data = (await claim2.json()) as any
        expect(claim2Data.epoch).toBe(3) // 0 -> 1 (claim1) -> 2 (alarm) -> 3 (claim2)

        // Worker 1 awakens and sends stale heartbeat under Epoch 1 -> 409 Conflict
        const staleHb = await coordinator.fetch(
            new Request('https://do.internal/leases/heartbeat', {
                method: 'POST',
                body: JSON.stringify({
                    taskId: 'shot-fenced',
                    epoch: 1,
                }),
            }),
        )
        expect(staleHb.status).toBe(409)

        // Worker 1 awakens and attempts to complete with stale Epoch 1 -> 409 Conflict
        const staleRes = await coordinator.fetch(
            new Request('https://do.internal/tasks/complete', {
                method: 'POST',
                body: JSON.stringify({
                    taskId: 'shot-fenced',
                    epoch: 1,
                    stagingKey:
                        'staging/renders/shot-fenced/epoch_1_a8f5b3c2e1d0f4a8b7c9e0d1f2a3b4c5.mp4',
                }),
            }),
        )
        expect(staleRes.status).toBe(409)
        const staleData = (await staleRes.json()) as any
        expect(staleData.fenced).toBe(true)

        // Worker 2 completes under valid active Epoch 3 -> 200 OK & alarm cleared
        const okRes = await coordinator.fetch(
            new Request('https://do.internal/tasks/complete', {
                method: 'POST',
                body: JSON.stringify({
                    taskId: 'shot-fenced',
                    epoch: 3,
                    stagingKey:
                        'staging/renders/shot-fenced/epoch_3_a8f5b3c2e1d0f4a8b7c9e0d1f2a3b4c5.mp4',
                }),
            }),
        )
        expect(okRes.status).toBe(200)
        expect(mockCtx.storage.activeAlarm).toBeNull() // Alarm deleted on successful completion
    })
})
