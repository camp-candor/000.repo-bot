import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ShotCoordinatorDO } from '../../src/objects/ShotCoordinatorDO.js'

class MockDurableObjectStorage {
    private store: Map<string, any> = new Map()
    public scheduledAlarm: number | null = null

    async get<T = any>(key: string): Promise<T | undefined> {
        return this.store.get(key)
    }

    async put(key: string, value: any): Promise<void> {
        this.store.set(key, value)
    }

    async delete(key: string): Promise<boolean> {
        return this.store.delete(key)
    }

    async setAlarm(deadlineMs: number): Promise<void> {
        this.scheduledAlarm = deadlineMs
    }

    async deleteAlarm(): Promise<void> {
        this.scheduledAlarm = null
    }
}

class MockDurableObjectState {
    public storage: MockDurableObjectStorage

    constructor() {
        this.storage = new MockDurableObjectStorage()
    }
}

describe('ShotCoordinatorDO Authority & Hardware Fencing Battery', () => {
    let mockState: MockDurableObjectState
    let coordinator: ShotCoordinatorDO

    beforeEach(async () => {
        mockState = new MockDurableObjectState()
        coordinator = new ShotCoordinatorDO(mockState as any)

        // Initialize task
        const initReq = new Request('https://do/fsm/initialize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                taskId: 'TASK-DO-001',
                isHighRiskPath: false,
                maxAttempts: 3,
                branchName: 'spec/task-do-001',
            }),
        })
        const res = await coordinator.fetch(initReq)
        expect(res.status).toBe(200)
    })

    it('TASK-3.1: increments monotonic epoch upon claim and rejects stale worker heartbeat', async () => {
        // 1. Claim task (advances epoch from 1 to 2, transitions PENDING -> CLAIMED)
        const claimRes = await coordinator.fetch(
            new Request('https://do/fsm/claim', { method: 'POST' }),
        )
        expect(claimRes.status).toBe(200)
        const claimData: any = await claimRes.json()
        expect(claimData.state).toBe('CLAIMED')
        expect(claimData.epoch).toBe(2)

        // 2. Worker acknowledges lease (CLAIMED -> RUNNING)
        const ackRes = await coordinator.fetch(
            new Request('https://do/fsm/transition', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    event: 'WORKER_ACK',
                    actor: {
                        type: 'REMOTE_WORKER',
                        workerId: 'worker-1',
                        epoch: 2,
                    },
                }),
            }),
        )
        expect(ackRes.status).toBe(200)

        // 3. Stale worker heartbeat using superseded epoch 1 -> Rejected with 409
        const staleHeartbeatRes = await coordinator.fetch(
            new Request('https://do/fsm/heartbeat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ epoch: 1 }),
            }),
        )
        expect(staleHeartbeatRes.status).toBe(409)
        const staleData: any = await staleHeartbeatRes.json()
        expect(staleData.error).toContain('STALE_WORKER_EPOCH')

        // 4. Valid worker heartbeat using active epoch 2 -> Accepted
        const validHeartbeatRes = await coordinator.fetch(
            new Request('https://do/fsm/heartbeat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ epoch: 2 }),
            }),
        )
        expect(validHeartbeatRes.status).toBe(200)
    })

    it('TASK-3.2: arms 30s watchdog upon entering RUNNING and executes universal leaveRunning disarm on exit', async () => {
        // Claim and enter RUNNING
        await coordinator.fetch(
            new Request('https://do/fsm/claim', { method: 'POST' }),
        )
        await coordinator.fetch(
            new Request('https://do/fsm/transition', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    event: 'WORKER_ACK',
                    actor: {
                        type: 'REMOTE_WORKER',
                        workerId: 'worker-1',
                        epoch: 2,
                    },
                }),
            }),
        )

        // Assert that watchdog alarm is armed
        expect(mockState.storage.scheduledAlarm).not.toBeNull()
        const activeTimer = await mockState.storage.get('active_timer')
        expect(activeTimer).toBeDefined()
        expect(activeTimer.epoch).toBe(2)

        // Universal leaveRunning test: submit verification (RUNNING -> VERIFYING)
        const headSha = '1111111111111111111111111111111111111111'
        const verifyRes = await coordinator.fetch(
            new Request('https://do/fsm/transition', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    event: 'SUBMIT_VERIFY',
                    actor: {
                        type: 'REMOTE_WORKER',
                        workerId: 'worker-1',
                        epoch: 2,
                    },
                    payload: { headSha },
                }),
            }),
        )
        expect(verifyRes.status).toBe(200)

        // Assert that watchdog alarm was explicitly disarmed
        expect(mockState.storage.scheduledAlarm).toBeNull()
        const disarmedTimer = await mockState.storage.get('active_timer')
        expect(disarmedTimer).toBeUndefined()
    })

    it('TASK-3.2: alarm() trigger fires WATCHDOG_EXPIRE and advances epoch to fence out timed-out worker', async () => {
        // Enter RUNNING
        await coordinator.fetch(
            new Request('https://do/fsm/claim', { method: 'POST' }),
        )
        await coordinator.fetch(
            new Request('https://do/fsm/transition', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    event: 'WORKER_ACK',
                    actor: {
                        type: 'REMOTE_WORKER',
                        workerId: 'worker-1',
                        epoch: 2,
                    },
                }),
            }),
        )

        // Trigger proactive storage alarm directly
        await coordinator.alarm()

        // Verify task transitioned to RETRYING and epoch is bumped
        const ctxRes = await coordinator.fetch(
            new Request('https://do/fsm/context'),
        )
        const data: any = await ctxRes.json()
        expect(data.currentState).toBe('RETRYING')

        // Claim next retry -> Epoch must now be 3
        const nextClaimRes = await coordinator.fetch(
            new Request('https://do/fsm/claim', { method: 'POST' }),
        )
        const nextClaimData: any = await nextClaimRes.json()
        expect(nextClaimData.epoch).toBe(3)
    })

    it('TASK-3.3: enforces Content-Addressed Promotion Gate Fencing against zombie worker uploads', async () => {
        // 1. Enter RUNNING on epoch 2
        await coordinator.fetch(
            new Request('https://do/fsm/claim', { method: 'POST' }),
        )
        await coordinator.fetch(
            new Request('https://do/fsm/transition', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    event: 'WORKER_ACK',
                    actor: {
                        type: 'REMOTE_WORKER',
                        workerId: 'worker-1',
                        epoch: 2,
                    },
                }),
            }),
        )

        // 2. Zombie worker upload promotion attempt with expired epoch 1 -> HTTP 409
        const stalePromoRes = await coordinator.fetch(
            new Request('https://do/tasks/complete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    epoch: 1,
                    headSha: 'badf00d111111111111111111111111111111111',
                }),
            }),
        )
        expect(stalePromoRes.status).toBe(409)
        const staleData: any = await stalePromoRes.json()
        expect(staleData.error).toContain('PROMOTION_FENCE_REJECTED')

        // 3. Valid worker promotion with epoch 2 -> HTTP 200 (transitions to VERIFYING)
        const validPromoRes = await coordinator.fetch(
            new Request('https://do/tasks/complete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    epoch: 2,
                    headSha: 'goodf00d222222222222222222222222222222222',
                }),
            }),
        )
        expect(validPromoRes.status).toBe(200)
        const validData: any = await validPromoRes.json()
        expect(validData.state).toBe('VERIFYING')
        expect(validData.promotedHeadSha).toBe(
            'goodf00d222222222222222222222222222222222',
        )
    })

    describe('Antigravity Adversarial Hardware Fencing Battery (Gauntlet Level 3 & Level 4)', () => {
        it('INV-1: Zombie Worker Heartbeat Fencing (Post-Timeout Rejection)', async () => {
            // Step 1: Initialize and claim task TASK-FENCE-01 (Epoch advances to 2, enters CLAIMED -> RUNNING)
            const initRes = await coordinator.fetch(
                new Request('https://do/fsm/initialize', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        taskId: 'TASK-FENCE-01',
                        isHighRiskPath: false,
                        maxAttempts: 3,
                        branchName: 'spec/task-fence-01',
                    }),
                }),
            )
            expect(initRes.status).toBe(200)

            const claimRes = await coordinator.fetch(
                new Request('https://do/fsm/claim', { method: 'POST' }),
            )
            expect(claimRes.status).toBe(200)
            const claimData: any = await claimRes.json()
            expect(claimData.epoch).toBe(2)
            expect(claimData.state).toBe('CLAIMED')

            const ackRes = await coordinator.fetch(
                new Request('https://do/fsm/transition', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        event: 'WORKER_ACK',
                        actor: {
                            type: 'REMOTE_WORKER',
                            workerId: 'worker-fence-01',
                            epoch: 2,
                        },
                    }),
                }),
            )
            expect(ackRes.status).toBe(200)

            // Step 2: Trigger alarm() to simulate a missed heartbeat (Epoch advances to 3, enters RETRYING)
            await coordinator.alarm()

            const ctxRes = await coordinator.fetch(
                new Request('https://do/fsm/context'),
            )
            const ctxData: any = await ctxRes.json()
            expect(ctxData.currentState).toBe('RETRYING')
            expect(ctxData.context.currentEpoch).toBe(3)

            // Step 3: Zombie worker from Epoch 2 attempts POST /fsm/heartbeat with { epoch: 2 }
            const zombieHeartbeatRes = await coordinator.fetch(
                new Request('https://do/fsm/heartbeat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ epoch: 2 }),
                }),
            )

            // ASSERTION: Request strictly returns HTTP 409 Conflict with error matching STALE_WORKER_EPOCH
            expect(zombieHeartbeatRes.status).toBe(409)
            const zombieData: any = await zombieHeartbeatRes.json()
            expect(zombieData.error).toContain('STALE_WORKER_EPOCH')

            // ASSERTION: State remains RETRYING, epoch remains 3, and the zombie worker is completely fenced out
            const verifyCtxRes = await coordinator.fetch(
                new Request('https://do/fsm/context'),
            )
            const verifyData: any = await verifyCtxRes.json()
            expect(verifyData.currentState).toBe('RETRYING')
            expect(verifyData.context.currentEpoch).toBe(3)
        })

        it('INV-2: The Stale Promotion Boundary Trap (R2 Staging Defense)', async () => {
            // Step 1: Worker claims task TASK-FENCE-02 under Epoch 2 and transitions to RUNNING
            const initRes = await coordinator.fetch(
                new Request('https://do/fsm/initialize', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        taskId: 'TASK-FENCE-02',
                        isHighRiskPath: false,
                        maxAttempts: 3,
                        branchName: 'spec/task-fence-02',
                    }),
                }),
            )
            expect(initRes.status).toBe(200)

            const claimRes = await coordinator.fetch(
                new Request('https://do/fsm/claim', { method: 'POST' }),
            )
            const claimData: any = await claimRes.json()
            expect(claimData.epoch).toBe(2)

            await coordinator.fetch(
                new Request('https://do/fsm/transition', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        event: 'WORKER_ACK',
                        actor: {
                            type: 'REMOTE_WORKER',
                            workerId: 'worker-fence-02',
                            epoch: 2,
                        },
                    }),
                }),
            )

            // Step 2: Partition the network; task times out and is reclaimed by another runner under Epoch 3
            await coordinator.alarm()

            const reclaimRes = await coordinator.fetch(
                new Request('https://do/fsm/claim', { method: 'POST' }),
            )
            expect(reclaimRes.status).toBe(200)
            const reclaimData: any = await reclaimRes.json()
            expect(reclaimData.epoch).toBe(3)
            expect(reclaimData.state).toBe('CLAIMED')

            // Step 3: Zombie worker finishes rendering and calls POST /tasks/complete carrying { epoch: 2, headSha: "bad-sha" }
            const zombieCompleteRes = await coordinator.fetch(
                new Request('https://do/tasks/complete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        epoch: 2,
                        headSha: 'bad-sha-00000000000000000000000000000000',
                    }),
                }),
            )

            // ASSERTION: Request strictly returns HTTP 409 Conflict with error matching PROMOTION_FENCE_REJECTED
            expect(zombieCompleteRes.status).toBe(409)
            const zombieData: any = await zombieCompleteRes.json()
            expect(zombieData.error).toContain('PROMOTION_FENCE_REJECTED')

            // ASSERTION: The candidate SHA is rejected, and the task remains anchored to Epoch 3
            const verifyCtxRes = await coordinator.fetch(
                new Request('https://do/fsm/context'),
            )
            const verifyData: any = await verifyCtxRes.json()
            expect(verifyData.context.currentEpoch).toBe(3)
            expect(verifyData.context.candidateHeadSha).toBeUndefined()
            expect(verifyData.currentState).toBe('CLAIMED')
        })

        it('INV-3: Watchdog Alarm Disarming Invariant (leaveRunning Verification)', async () => {
            // Step 1: Advance task to RUNNING. Confirm storage.scheduledAlarm is not null and active_timer exists
            const claimRes = await coordinator.fetch(
                new Request('https://do/fsm/claim', { method: 'POST' }),
            )
            const claimData: any = await claimRes.json()
            const activeEpoch = claimData.epoch

            await coordinator.fetch(
                new Request('https://do/fsm/transition', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        event: 'WORKER_ACK',
                        actor: {
                            type: 'REMOTE_WORKER',
                            workerId: 'worker-disarm',
                            epoch: activeEpoch,
                        },
                    }),
                }),
            )

            expect(mockState.storage.scheduledAlarm).not.toBeNull()
            const activeTimer = await mockState.storage.get('active_timer')
            expect(activeTimer).toBeDefined()
            expect(activeTimer.type).toBe('WATCHDOG')
            expect(activeTimer.epoch).toBe(activeEpoch)

            // Step 2: Worker calls POST /tasks/complete with valid epoch and headSha (RUNNING -> VERIFYING)
            const completeRes = await coordinator.fetch(
                new Request('https://do/tasks/complete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        epoch: activeEpoch,
                        headSha: 'valid-sha-12345678901234567890123456789012',
                    }),
                }),
            )
            expect(completeRes.status).toBe(200)

            // ASSERTION: storage.scheduledAlarm must be explicitly null
            expect(mockState.storage.scheduledAlarm).toBeNull()

            // ASSERTION: active_timer metadata must be deleted from storage
            const disarmedTimer = await mockState.storage.get('active_timer')
            expect(disarmedTimer).toBeUndefined()

            // Step 3: Manually invoke alarm()
            await coordinator.alarm()

            // ASSERTION: State remains VERIFYING (zero false-positive timeouts occur against verified work)
            const ctxRes = await coordinator.fetch(
                new Request('https://do/fsm/context'),
            )
            const ctxData: any = await ctxRes.json()
            expect(ctxData.currentState).toBe('VERIFYING')
        })

        it('INV-4: Rolling Watchdog Heartbeat Extension', async () => {
            vi.useFakeTimers()
            try {
                // Step 1: Advance task to RUNNING. Record scheduledAlarm_1
                const claimRes = await coordinator.fetch(
                    new Request('https://do/fsm/claim', { method: 'POST' }),
                )
                const claimData: any = await claimRes.json()
                const currentEpoch = claimData.epoch

                await coordinator.fetch(
                    new Request('https://do/fsm/transition', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            event: 'WORKER_ACK',
                            actor: {
                                type: 'REMOTE_WORKER',
                                workerId: 'worker-rolling',
                                epoch: currentEpoch,
                            },
                        }),
                    }),
                )

                const scheduledAlarm_1 = mockState.storage.scheduledAlarm
                expect(scheduledAlarm_1).not.toBeNull()

                // Step 2: Advance simulated clock by 10,000ms. Dispatch valid worker heartbeat
                vi.advanceTimersByTime(10_000)

                const heartbeatRes = await coordinator.fetch(
                    new Request('https://do/fsm/heartbeat', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ epoch: currentEpoch }),
                    }),
                )
                expect(heartbeatRes.status).toBe(200)

                const scheduledAlarm_2 = mockState.storage.scheduledAlarm
                expect(scheduledAlarm_2).not.toBeNull()

                // ASSERTION: scheduledAlarm_2 > scheduledAlarm_1 (deadline extended by 30 seconds from heartbeat time)
                expect(scheduledAlarm_2!).toBeGreaterThan(scheduledAlarm_1!)
                expect(scheduledAlarm_2!).toBe(scheduledAlarm_1! + 10_000)

                // ASSERTION: State remains RUNNING and epoch remains unchanged
                const ctxRes = await coordinator.fetch(
                    new Request('https://do/fsm/context'),
                )
                const ctxData: any = await ctxRes.json()
                expect(ctxData.currentState).toBe('RUNNING')
                expect(ctxData.context.currentEpoch).toBe(currentEpoch)
            } finally {
                vi.useRealTimers()
            }
        })

        it('INV-5: Storage Hydration & Crash Recovery Simulation', async () => {
            // Step 1: Advance task to RUNNING under Epoch 4 with 2 items in outbox
            await mockState.storage.put('fsm_record', {
                currentState: 'RUNNING',
                ctx: {
                    taskId: 'TASK-HYDRATE-04',
                    currentEpoch: 4,
                    attemptCount: 1,
                    maxAttempts: 3,
                    isHighRiskPath: false,
                    scopeCheckPassed: false,
                    qualityCheckPassed: false,
                    branchName: 'spec/task-hydrate-04',
                    targetRepo: 'camp-candor/000.repo-bot',
                    baseCommitSha: '0000000000000000000000000000000000000000',
                },
                outbox: [
                    {
                        eventId: 'evt-task-hydrate-1',
                        fromState: 'PENDING',
                        toState: 'CLAIMED',
                        event: 'LEASE_CLAIMED',
                        timestampMs: Date.now() - 5000,
                    },
                    {
                        eventId: 'evt-task-hydrate-2',
                        fromState: 'CLAIMED',
                        toState: 'RUNNING',
                        event: 'WORKER_ACK',
                        timestampMs: Date.now() - 2000,
                    },
                ],
            })

            // Step 2: Tear down in-memory ShotCoordinatorDO instance and instantiate a new instance backed by the same storage state
            const resurrectedCoordinator = new ShotCoordinatorDO(
                mockState as any,
            )

            // Step 3: Query GET /fsm/context
            const ctxRes = await resurrectedCoordinator.fetch(
                new Request('https://do/fsm/context'),
            )
            expect(ctxRes.status).toBe(200)
            const ctxData: any = await ctxRes.json()

            // ASSERTION: Returns currentState === 'RUNNING', currentEpoch === 4, and outboxPendingCount === 2
            expect(ctxData.currentState).toBe('RUNNING')
            expect(ctxData.context.currentEpoch).toBe(4)
            expect(ctxData.outboxPendingCount).toBe(2)
        })

        it('LEVEL 4: rejects arbitrary initialize reset once task is active without explicit authorization', async () => {
            // Advance task to CLAIMED
            await coordinator.fetch(
                new Request('https://do/fsm/claim', { method: 'POST' }),
            )

            // Attempt unauthorized reset -> 409 Conflict
            const rogueResetRes = await coordinator.fetch(
                new Request('https://do/fsm/initialize', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ taskId: 'ROGUE-RESET' }),
                }),
            )
            expect(rogueResetRes.status).toBe(409)
            const rogueData: any = await rogueResetRes.json()
            expect(rogueData.error).toContain('CANNOT_INITIALIZE_ACTIVE_TASK')

            // Authorized force reset -> 200 OK
            const forceResetRes = await coordinator.fetch(
                new Request('https://do/fsm/initialize', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        taskId: 'FORCE-RESET',
                        force: true,
                    }),
                }),
            )
            expect(forceResetRes.status).toBe(200)
            const forceData: any = await forceResetRes.json()
            expect(forceData.state).toBe('PENDING')
        })
    })
})
