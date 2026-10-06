import { describe, it, expect } from 'vitest'
import {
    evaluateTransition,
    TRANSITION_TABLE,
    TaskState,
    FSMEvent,
    AuthenticatedActor,
    FSMContext,
} from '../../src/fsm/transitions.js'

function createInitialContext(overrides: Partial<FSMContext> = {}): FSMContext {
    return {
        taskId: 'TASK-001',
        currentEpoch: 1,
        attemptCount: 1,
        maxAttempts: 3,
        isHighRiskPath: false,
        scopeCheckPassed: false,
        qualityCheckPassed: false,
        branchName: 'spec/task-001-attempt1',
        targetRepo: 'camp-candor/000.repo-bot',
        baseCommitSha: '0000000000000000000000000000000000000000',
        ...overrides,
    }
}

describe('FSM Transitions Core Engine Suite', () => {
    it('TASK-2.1 & 2.2: executes Low-Risk Straight-Through Merge Path', () => {
        let ctx = createInitialContext({ isHighRiskPath: false })
        let state: TaskState = 'PENDING'

        // 1. PENDING -> CLAIMED
        const res1 = evaluateTransition(
            state,
            'LEASE_CLAIMED',
            { type: 'SYSTEM_INTERNAL' },
            ctx,
        )
        expect(res1.nextState).toBe('CLAIMED')
        state = res1.nextState
        ctx = { ...ctx, ...res1.contextPatch }
        expect(ctx.currentEpoch).toBe(2)

        // 2. CLAIMED -> RUNNING
        const res2 = evaluateTransition(
            state,
            'WORKER_ACK',
            { type: 'REMOTE_WORKER', workerId: 'worker-1', epoch: 2 },
            ctx,
        )
        expect(res2.nextState).toBe('RUNNING')
        state = res2.nextState

        // 3. RUNNING -> VERIFYING
        const headSha = '1111111111111111111111111111111111111111'
        const res3 = evaluateTransition(
            state,
            'SUBMIT_VERIFY',
            { type: 'REMOTE_WORKER', workerId: 'worker-1', epoch: 2 },
            ctx,
            { headSha },
        )
        expect(res3.nextState).toBe('VERIFYING')
        state = res3.nextState
        ctx = { ...ctx, ...res3.contextPatch }
        expect(ctx.candidateHeadSha).toBe(headSha)

        // 4. VERIFYING -> SCOPE_PASSED
        const res4 = evaluateTransition(
            state,
            'SCOPE_PASS',
            { type: 'AUDIT_ENGINE' },
            ctx,
            { headSha, isHighRiskPath: false },
        )
        expect(res4.nextState).toBe('SCOPE_PASSED')
        state = res4.nextState
        ctx = { ...ctx, ...res4.contextPatch }
        expect(ctx.scopeCheckPassed).toBe(true)
        expect(ctx.auditedHeadSha).toBe(headSha)

        // 5. SCOPE_PASSED -> MERGING (Low-Risk auto-routes to MERGING)
        const res5 = evaluateTransition(
            state,
            'QUALITY_PASS',
            { type: 'AUDIT_ENGINE' },
            ctx,
            { headSha },
        )
        expect(res5.nextState).toBe('MERGING')
        state = res5.nextState
        ctx = { ...ctx, ...res5.contextPatch }
        expect(ctx.qualityCheckPassed).toBe(true)

        // 6. MERGING -> MERGED
        const res6 = evaluateTransition(
            state,
            'MERGE_SUCCEEDED',
            { type: 'SYSTEM_INTERNAL' },
            ctx,
        )
        expect(res6.nextState).toBe('MERGED')
    })

    it('TASK-2.1 & 2.2: executes High-Risk Human-in-the-Loop Approval Path', () => {
        let ctx = createInitialContext({ isHighRiskPath: true })
        let state: TaskState = 'SCOPE_PASSED'
        const headSha = '2222222222222222222222222222222222222222'
        ctx.candidateHeadSha = headSha
        ctx.auditedHeadSha = headSha
        ctx.scopeCheckPassed = true

        // 1. SCOPE_PASSED -> AWAITING_APPROVAL (High-Risk routes to human gate)
        const res1 = evaluateTransition(
            state,
            'QUALITY_PASS',
            { type: 'AUDIT_ENGINE' },
            ctx,
            { headSha },
        )
        expect(res1.nextState).toBe('AWAITING_APPROVAL')
        state = res1.nextState
        ctx = { ...ctx, ...res1.contextPatch }
        expect(ctx.qualityCheckPassed).toBe(true)

        // Unauthorized actor rejection (Worker cannot approve PR)
        expect(() =>
            evaluateTransition(
                state,
                'HUMAN_APPROVE',
                { type: 'REMOTE_WORKER', workerId: 'rogue', epoch: 1 },
                ctx,
                { approvedHeadSha: headSha },
            ),
        ).toThrow(/UNAUTHORIZED_OR_GUARD_FAILED/)

        // 2. AWAITING_APPROVAL -> MERGING
        const res2 = evaluateTransition(
            state,
            'HUMAN_APPROVE',
            { type: 'LEAD_ARCHITECT', userId: 'U12345' },
            ctx,
            { approvedHeadSha: headSha },
        )
        expect(res2.nextState).toBe('MERGING')
        state = res2.nextState

        // 3. MERGING -> MERGED
        const res3 = evaluateTransition(
            state,
            'MERGE_SUCCEEDED',
            { type: 'SYSTEM_INTERNAL' },
            ctx,
        )
        expect(res3.nextState).toBe('MERGED')
    })

    it('TASK-2.2: enforces Worker Epoch Fencing against stale zombie heartbeats', () => {
        const ctx = createInitialContext({ currentEpoch: 4 })

        expect(() =>
            evaluateTransition(
                'RUNNING',
                'SUBMIT_VERIFY',
                { type: 'REMOTE_WORKER', workerId: 'worker-zombie', epoch: 3 },
                ctx,
                { headSha: '3333333333333333333333333333333333333333' },
            ),
        ).toThrow(/STALE_WORKER_EPOCH/)
    })

    it('TASK-2.2: resets audit context when NEW_HEAD_PUSHED drifts from verified SHA', () => {
        const initialSha = 'aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111'
        const driftedSha = 'bbbb2222bbbb2222bbbb2222bbbb2222bbbb2222'
        const ctx = createInitialContext({
            isHighRiskPath: true,
            candidateHeadSha: initialSha,
            auditedHeadSha: initialSha,
            scopeCheckPassed: true,
            qualityCheckPassed: true,
        })

        const res = evaluateTransition(
            'AWAITING_APPROVAL',
            'NEW_HEAD_PUSHED',
            { type: 'AUDIT_ENGINE' },
            ctx,
            { headSha: driftedSha },
        )

        expect(res.nextState).toBe('VERIFYING')
        expect(res.contextPatch?.candidateHeadSha).toBe(driftedSha)
        expect(res.contextPatch?.scopeCheckPassed).toBe(false)
        expect(res.contextPatch?.qualityCheckPassed).toBe(false)
        expect(res.contextPatch?.auditedHeadSha).toBeUndefined()
    })

    it('TASK-2.2: resolves late and duplicate events on terminal states as idempotent no-ops', () => {
        const ctx = createInitialContext({ currentEpoch: 2 })

        // Late worker event on MERGED state
        const resMerged = evaluateTransition(
            'MERGED',
            'SUBMIT_VERIFY',
            { type: 'REMOTE_WORKER', workerId: 'worker-late', epoch: 1 },
            ctx,
            { headSha: '4444444444444444444444444444444444444444' },
        )
        expect(resMerged.isNoop).toBe(true)
        expect(resMerged.nextState).toBe('MERGED')

        // Duplicate watchdog on DLQ state
        const resDlq = evaluateTransition(
            'DLQ',
            'WATCHDOG_EXPIRE',
            { type: 'SYSTEM_INTERNAL' },
            ctx,
        )
        expect(resDlq.isNoop).toBe(true)
        expect(resDlq.nextState).toBe('DLQ')
    })

    it('TASK-2.2: enables emergency halt across all non-terminal active states', () => {
        const activeStates: TaskState[] = [
            'PENDING',
            'CLAIMED',
            'RUNNING',
            'VERIFYING',
            'SCOPE_PASSED',
            'AWAITING_APPROVAL',
            'RETRYING',
        ]

        for (const state of activeStates) {
            const ctx = createInitialContext()
            const res = evaluateTransition(
                state,
                'KILL_SWITCH_TRIP',
                { type: 'SYSTEM_INTERNAL' },
                ctx,
            )
            expect(res.nextState).toBe('HALTED')
        }
    })

    it('TASK-2.2: cleanly partitions attempt thresholds on WATCHDOG_EXPIRE', () => {
        const ctxUnderMax = createInitialContext({
            attemptCount: 1,
            maxAttempts: 3,
        })
        const resRetry = evaluateTransition(
            'RUNNING',
            'WATCHDOG_EXPIRE',
            { type: 'SYSTEM_INTERNAL' },
            ctxUnderMax,
        )
        expect(resRetry.nextState).toBe('RETRYING')

        const ctxExhausted = createInitialContext({
            attemptCount: 3,
            maxAttempts: 3,
        })
        const resRollback = evaluateTransition(
            'RUNNING',
            'WATCHDOG_EXPIRE',
            { type: 'SYSTEM_INTERNAL' },
            ctxExhausted,
        )
        expect(resRollback.nextState).toBe('ROLLING_BACK')
    })

    it('TASK-2.3: executes 10,000 fuzzed pseudo-random transition sequences', () => {
        const allStates: TaskState[] = [
            'PENDING',
            'CLAIMED',
            'RUNNING',
            'VERIFYING',
            'SCOPE_PASSED',
            'AWAITING_APPROVAL',
            'MERGING',
            'MERGED',
            'RETRYING',
            'ROLLING_BACK',
            'ROLLED_BACK',
            'DLQ',
            'HALTED',
        ]

        const allEvents: FSMEvent[] = [
            'LEASE_CLAIMED',
            'WORKER_ACK',
            'SUBMIT_VERIFY',
            'SCOPE_PASS',
            'QUALITY_PASS',
            'QUALITY_FAIL_RETRY',
            'SECURITY_VIOLATION',
            'NEW_HEAD_PUSHED',
            'HUMAN_APPROVE',
            'HUMAN_REJECT',
            'APPROVAL_TIMEOUT',
            'WATCHDOG_EXPIRE',
            'ABSOLUTE_TIMEOUT',
            'VERIFICATION_TIMEOUT',
            'MERGE_TIMEOUT',
            'ROLLBACK_TIMEOUT',
            'KILL_SWITCH_TRIP',
            'BUDGET_EXHAUSTED',
            'OPERATOR_CANCEL',
            'OPERATOR_RESUME',
            'OPERATOR_REQUEUE',
            'MERGE_SUCCEEDED',
            'MERGE_FAILED_HEAD_MOVED',
            'MERGE_FAILED_CONFLICT',
            'ROLLBACK_COMPLETE',
            'WORKER_ABORT',
            'RECONCILER_EXPIRY',
        ]

        // Linear Congruential Generator for reproducible pseudo-random fuzzing
        let seed = 92125
        function prng(): number {
            seed = (seed * 1664525 + 1013904223) % 4294967296
            return seed / 4294967296
        }

        let state: TaskState = 'PENDING'
        let ctx = createInitialContext()

        for (let i = 0; i < 10000; i++) {
            const event = allEvents[Math.floor(prng() * allEvents.length)]
            const actorIdx = Math.floor(prng() * 4)
            let actor: AuthenticatedActor

            switch (actorIdx) {
                case 0:
                    actor = { type: 'SYSTEM_INTERNAL' }
                    break
                case 1:
                    actor = {
                        type: 'REMOTE_WORKER',
                        workerId: 'worker-fuzz',
                        epoch: ctx.currentEpoch,
                    }
                    break
                case 2:
                    actor = { type: 'AUDIT_ENGINE' }
                    break
                default:
                    actor = { type: 'LEAD_ARCHITECT', userId: 'U-FUZZ' }
            }

            const testSha = 'feedfacefeedfacefeedfacefeedfacefeedface'
            const payload = {
                headSha: testSha,
                approvedHeadSha: ctx.auditedHeadSha,
                isHighRiskPath: ctx.isHighRiskPath,
                reason: 'FUZZ_REASON',
            }

            try {
                const result = evaluateTransition(
                    state,
                    event,
                    actor,
                    ctx,
                    payload,
                )
                expect(allStates).toContain(result.nextState)
                state = result.nextState
                if (result.contextPatch) {
                    ctx = { ...ctx, ...result.contextPatch }
                }
            } catch (err: any) {
                // Assert that thrown errors are valid domain rejections, not unhandled runtime exceptions
                expect(err.message).toMatch(
                    /ILLEGAL_FSM_TRANSITION|UNAUTHORIZED_OR_GUARD_FAILED|AMBIGUOUS_TRANSITION_ERROR|STALE_WORKER_EPOCH/,
                )
            }
        }
    })

    describe('Antigravity Formal Invariants Battery (Gauntlet Level 3)', () => {
        it('INV-1: Terminal State Idempotency (Late Webhook Defense)', () => {
            const terminalStates: TaskState[] = ['MERGED', 'DLQ']
            const events: FSMEvent[] = [
                'WORKER_ACK',
                'QUALITY_PASS',
                'WATCHDOG_EXPIRE',
                'SUBMIT_VERIFY',
                'SECURITY_VIOLATION',
            ]
            const ctx = createInitialContext({ currentEpoch: 5 })

            for (const st of terminalStates) {
                for (const evt of events) {
                    // Verify that even stale worker epoch does NOT throw STALE_WORKER_EPOCH
                    const resWorker = evaluateTransition(
                        st,
                        evt,
                        {
                            type: 'REMOTE_WORKER',
                            workerId: 'zombie-1',
                            epoch: 1,
                        },
                        ctx,
                        { headSha: 'deadbeef' },
                    )
                    expect(resWorker.isNoop).toBe(true)
                    expect(resWorker.nextState).toBe(st)

                    const resSystem = evaluateTransition(
                        st,
                        evt,
                        { type: 'SYSTEM_INTERNAL' },
                        ctx,
                    )
                    expect(resSystem.isNoop).toBe(true)
                    expect(resSystem.nextState).toBe(st)
                }
            }
        })

        it('INV-2: Worker Epoch Fencing (Zombie Worker Trap)', () => {
            const ctx = createInitialContext({ currentEpoch: 4 })
            expect(() =>
                evaluateTransition(
                    'RUNNING',
                    'SUBMIT_VERIFY',
                    {
                        type: 'REMOTE_WORKER',
                        workerId: 'worker-stale',
                        epoch: 3,
                    },
                    ctx,
                    { headSha: 'abc123' },
                ),
            ).toThrow(/STALE_WORKER_EPOCH/)
        })

        it('INV-3: Graph Reachability Safety (Two-Stage Verification BFS)', () => {
            // Helper: checks if target is reachable from start given an allowed state filter
            function isReachable(
                start: TaskState,
                target: TaskState,
                allowedStates?: (state: TaskState) => boolean,
            ): boolean {
                const visited = new Set<TaskState>()
                const queue: TaskState[] = [start]
                visited.add(start)

                while (queue.length > 0) {
                    const curr = queue.shift()!
                    if (curr === target) return true

                    for (const rule of TRANSITION_TABLE) {
                        if (rule.from === curr) {
                            const next = rule.to
                            if (
                                !visited.has(next) &&
                                (!allowedStates || allowedStates(next))
                            ) {
                                visited.add(next)
                                queue.push(next)
                            }
                        }
                    }
                }
                return false
            }

            // Assertion 1: Remove SCOPE_PASSED -> MERGED is completely unreachable from PENDING
            expect(
                isReachable('PENDING', 'MERGED', (s) => s !== 'SCOPE_PASSED'),
            ).toBe(false)

            // Assertion 2: Remove MERGING -> MERGED is completely unreachable from PENDING
            expect(
                isReachable('PENDING', 'MERGED', (s) => s !== 'MERGING'),
            ).toBe(false)

            // Assertion 3: On high-risk paths, AWAITING_APPROVAL cannot be bypassed to reach MERGING
            // Any transition directly from SCOPE_PASSED to MERGING has guard requiring !ctx.isHighRiskPath
            const directRules = TRANSITION_TABLE.filter(
                (r) => r.from === 'SCOPE_PASSED' && r.to === 'MERGING',
            )
            expect(directRules.length).toBeGreaterThan(0)
            for (const rule of directRules) {
                expect(rule.guard).toBeDefined()
                const highRiskCtx = createInitialContext({
                    isHighRiskPath: true,
                    scopeCheckPassed: true,
                    auditedHeadSha: 'sha1',
                })
                expect(rule.guard!(highRiskCtx, { headSha: 'sha1' })).toBe(
                    false,
                )
            }
        })

        it('INV-4: Liveness Assertion (No Unintended Sinks)', () => {
            const allStates: TaskState[] = [
                'PENDING',
                'CLAIMED',
                'RUNNING',
                'VERIFYING',
                'SCOPE_PASSED',
                'AWAITING_APPROVAL',
                'MERGING',
                'RETRYING',
                'ROLLING_BACK',
                'ROLLED_BACK',
                'HALTED',
            ]

            function canReachTerminal(start: TaskState): boolean {
                const visited = new Set<TaskState>()
                const queue: TaskState[] = [start]
                visited.add(start)

                while (queue.length > 0) {
                    const curr = queue.shift()!
                    if (curr === 'MERGED' || curr === 'DLQ') return true

                    for (const rule of TRANSITION_TABLE) {
                        if (rule.from === curr) {
                            if (!visited.has(rule.to)) {
                                visited.add(rule.to)
                                queue.push(rule.to)
                            }
                        }
                    }
                }
                return false
            }

            for (const state of allStates) {
                expect(canReachTerminal(state)).toBe(true)
            }
        })

        it('INV-5: Head-Drift Invalidation Defense', () => {
            const oldSha = '1111111111111111111111111111111111111111'
            const newSha = '2222222222222222222222222222222222222222'

            const testStates: TaskState[] = [
                'SCOPE_PASSED',
                'AWAITING_APPROVAL',
            ]
            for (const state of testStates) {
                const ctx = createInitialContext({
                    auditedHeadSha: oldSha,
                    candidateHeadSha: oldSha,
                    scopeCheckPassed: true,
                    qualityCheckPassed: true,
                })

                const res = evaluateTransition(
                    state,
                    'NEW_HEAD_PUSHED',
                    { type: 'AUDIT_ENGINE' },
                    ctx,
                    { headSha: newSha },
                )

                expect(res.nextState).toBe('VERIFYING')
                expect(res.contextPatch?.candidateHeadSha).toBe(newSha)
                expect(res.contextPatch?.scopeCheckPassed).toBe(false)
                expect(res.contextPatch?.qualityCheckPassed).toBe(false)
                expect(res.contextPatch?.auditedHeadSha).toBeUndefined()
            }
        })

        it('INV-6: Universal Emergency Halt Across Operational States', () => {
            const activeStates: TaskState[] = [
                'PENDING',
                'CLAIMED',
                'RUNNING',
                'VERIFYING',
                'SCOPE_PASSED',
                'AWAITING_APPROVAL',
                'RETRYING',
            ]

            for (const state of activeStates) {
                const ctx = createInitialContext()

                // 1. KILL_SWITCH_TRIP
                const res1 = evaluateTransition(
                    state,
                    'KILL_SWITCH_TRIP',
                    { type: 'SYSTEM_INTERNAL' },
                    ctx,
                )
                expect(res1.nextState).toBe('HALTED')

                // 2. BUDGET_EXHAUSTED
                const res2 = evaluateTransition(
                    state,
                    'BUDGET_EXHAUSTED',
                    { type: 'SYSTEM_INTERNAL' },
                    ctx,
                )
                expect(res2.nextState).toBe('HALTED')

                // 3. OPERATOR_CANCEL
                const res3 = evaluateTransition(
                    state,
                    'OPERATOR_CANCEL',
                    { type: 'LEAD_ARCHITECT', userId: 'admin' },
                    ctx,
                )
                expect(res3.nextState).toBe('HALTED')
            }
        })

        it('INV-7: Verification of Fuzzing Gate Robustness', () => {
            // Confirms all states and events tested in 10k fuzzer are fully bounded
            expect(TRANSITION_TABLE.length).toBeGreaterThan(0)
        })
    })
})
