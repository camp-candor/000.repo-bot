import { describe, it, expect, beforeEach } from 'vitest'
import { ShotCoordinatorDO } from '../../src/objects/ShotCoordinatorDO.js'
import { reconcileTaskProjections } from '../../src/crons/stateReconciler.js'
import {
    drainOutboxBatch,
    OutboxRecord,
} from '../../src/ledger/outboxDrainer.js'

class MockPreparedStatement {
    constructor(
        private sql: string,
        private params: any[] = [],
        private mockDb: MockD1Database,
    ) {}

    bind(...params: any[]) {
        return new MockPreparedStatement(this.sql, params, this.mockDb)
    }

    async run() {
        return this.mockDb._execute(this.sql, this.params)
    }

    async first() {
        const rows = await this.mockDb._query(this.sql, this.params)
        return rows[0] || null
    }

    async all() {
        const rows = await this.mockDb._query(this.sql, this.params)
        return { results: rows }
    }
}

class MockD1Database {
    tasks: Map<string, any> = new Map()
    attempts: Map<string, any> = new Map()
    events: Map<string, any> = new Map()
    shouldFailBatch = false
    updateCount = 0

    prepare(sql: string) {
        return new MockPreparedStatement(sql, [], this)
    }

    async batch(statements: MockPreparedStatement[]) {
        if (this.shouldFailBatch) {
            throw new Error('SIMULATED_D1_NETWORK_PARTITION')
        }
        const results = []
        for (const stmt of statements) {
            results.push(await stmt.run())
        }
        return results
    }

    async _execute(sql: string, params: any[]) {
        const trimmed = sql.trim()

        if (trimmed.startsWith('INSERT INTO task_events')) {
            const [
                eventId,
                taskId,
                attNum,
                seqNum,
                fromState,
                event,
                toState,
                actor,
                reason,
                epoch,
                payload,
                now,
            ] = params
            const key = `${taskId}:${seqNum}`
            if (!this.events.has(key)) {
                this.events.set(key, {
                    event_id: eventId,
                    task_id: taskId,
                    attempt_number: attNum,
                    sequence_number: seqNum,
                    from_state: fromState,
                    event,
                    to_state: toState,
                    actor,
                    reason,
                    epoch,
                    payload_json: payload,
                    timestamp_ms: now,
                })
            }
            return { meta: { changes: 1 } }
        }

        if (trimmed.startsWith('UPDATE tasks')) {
            this.updateCount++
            const [status, attNum, now, taskId] = params
            const task = this.tasks.get(taskId)
            if (task) {
                task.current_status = status
                task.current_attempt_number = attNum
                task.updated_at_ms = now
            }
            return { meta: { changes: 1 } }
        }

        if (trimmed.startsWith('UPDATE task_attempts')) {
            const [
                status,
                epoch,
                reason,
                exitStatus,
                completedAt,
                taskId,
                attNum,
            ] = params
            const key = `${taskId}:${attNum}`
            const att = this.attempts.get(key)
            if (att) {
                att.status = status
                att.last_projected_epoch = epoch
                if (reason) att.exit_reason = reason
                if (
                    ['MERGED', 'ROLLED_BACK', 'DLQ', 'HALTED'].includes(
                        exitStatus,
                    )
                ) {
                    att.completed_at_ms = completedAt
                }
            }
            return { meta: { changes: 1 } }
        }

        return { meta: { changes: 0 } }
    }

    async _query(sql: string, params: any[]) {
        const normalizedSql = sql.replace(/\s+/g, ' ')
        if (
            normalizedSql.includes(
                "FROM tasks WHERE current_status NOT IN ('MERGED', 'DLQ')",
            )
        ) {
            const limit = params[0] || 50
            return Array.from(this.tasks.values())
                .filter((t) => !['MERGED', 'DLQ'].includes(t.current_status))
                .slice(0, limit)
        }
        if (normalizedSql.includes('FROM tasks WHERE task_id = ?')) {
            const taskId = params[0]
            const match = this.tasks.get(taskId)
            return match ? [match] : []
        }
        return []
    }
}

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
    public storage = new MockDurableObjectStorage()
    private waitPromises: Promise<any>[] = []

    waitUntil(promise: Promise<any>) {
        this.waitPromises.push(promise)
    }

    async drainWaitUntil() {
        await Promise.all(this.waitPromises)
        this.waitPromises = []
    }
}

describe('Transactional Outbox & Projection Sync Reconciler Suite', () => {
    let mockDb: MockD1Database
    let mockState: MockDurableObjectState
    let coordinator: ShotCoordinatorDO

    beforeEach(async () => {
        mockDb = new MockD1Database()
        mockState = new MockDurableObjectState()
        coordinator = new ShotCoordinatorDO(mockState as any, { DB: mockDb })

        // Seed D1 and DO with task
        mockDb.tasks.set('TASK-SYNC-001', {
            task_id: 'TASK-SYNC-001',
            contract_version: 'v1',
            target_repo: 'camp-candor/000.repo-bot',
            day_folder: 'day-007',
            sequence_num: 1,
            file_type: 'JULES',
            file_path: 'data/directive/day-007/001.jules.md',
            max_attempts: 3,
            current_attempt_number: 1,
            current_status: 'PENDING',
            created_at_ms: Date.now(),
            updated_at_ms: Date.now(),
        })

        mockDb.attempts.set('TASK-SYNC-001:1', {
            attempt_id: 'att-TASK-SYNC-001-1',
            task_id: 'TASK-SYNC-001',
            attempt_number: 1,
            branch_name: 'spec/task-sync-001',
            base_commit_sha: '1111111111111111111111111111111111111111',
            head_sha: null,
            pr_number: null,
            last_projected_epoch: 1,
            status: 'PENDING',
            exit_reason: null,
            diagnostics_json: null,
            started_at_ms: Date.now(),
            completed_at_ms: null,
        })

        await coordinator.fetch(
            new Request('https://do/fsm/initialize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    taskId: 'TASK-SYNC-001',
                    branchName: 'spec/task-sync-001',
                    isHighRiskPath: false,
                }),
            }),
        )
    })

    it('TASK-4.1: stages transitions atomically into outbox storage before network sync', async () => {
        // Apply LEASE_CLAIMED
        await coordinator.fetch(
            new Request('https://do/fsm/claim', { method: 'POST' }),
        )

        const record = await mockState.storage.get('fsm_record')
        expect(record).toBeDefined()
        expect(record.currentState).toBe('CLAIMED')
        expect(record.outbox.length).toBeGreaterThanOrEqual(1)

        const firstOutbox = record.outbox[0]
        expect(firstOutbox.taskId).toBe('TASK-SYNC-001')
        expect(firstOutbox.toState).toBe('CLAIMED')
        expect(firstOutbox.sequenceNumber).toBe(1)
    })

    it('TASK-4.2: asynchronously flushes outbox records to D1 and prunes staged entries', async () => {
        await coordinator.fetch(
            new Request('https://do/fsm/claim', { method: 'POST' }),
        )

        // Drain outbox via RPC
        const drainRes = await coordinator.fetch(
            new Request('https://do/fsm/outbox/drain', { method: 'POST' }),
        )
        expect(drainRes.status).toBe(200)
        const drainData: any = await drainRes.json()
        expect(drainData.drainedCount).toBe(1)
        expect(drainData.remainingCount).toBe(0)

        // Verify D1 received the projection
        expect(mockDb.tasks.get('TASK-SYNC-001').current_status).toBe('CLAIMED')
        expect(mockDb.events.get('TASK-SYNC-001:1').to_state).toBe('CLAIMED')

        // Verify DO storage has pruned outbox
        const updatedRecord = await mockState.storage.get('fsm_record')
        expect(updatedRecord.outbox.length).toBe(0)
    })

    it('TASK-4.2: retains outbox records upon D1 failure without dropping state', async () => {
        mockDb.shouldFailBatch = true // Simulate D1 database partition

        await coordinator.fetch(
            new Request('https://do/fsm/claim', { method: 'POST' }),
        )

        // Outbox drain should fail gracefully
        const drainRes = await coordinator.fetch(
            new Request('https://do/fsm/outbox/drain', { method: 'POST' }),
        )
        expect(drainRes.status).toBe(500)

        // Verify items are preserved in DO storage
        const record = await mockState.storage.get('fsm_record')
        expect(record.outbox.length).toBe(1)
        expect(record.outbox[0].attempts).toBe(2) // 1 from auto-drain, 1 from manual drain

        // Restore D1 and drain again
        mockDb.shouldFailBatch = false
        const retryRes = await coordinator.fetch(
            new Request('https://do/fsm/outbox/drain', { method: 'POST' }),
        )
        expect(retryRes.status).toBe(200)
        const retryData: any = await retryRes.json()
        expect(retryData.drainedCount).toBe(1)
        expect(retryData.remainingCount).toBe(0)
    })

    it('TASK-4.3: state reconciler detects transient drift and heals D1 projection', async () => {
        // DO advances to CLAIMED -> RUNNING
        await coordinator.fetch(
            new Request('https://do/fsm/claim', { method: 'POST' }),
        )
        await coordinator.fetch(
            new Request('https://do/fsm/transition', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    event: 'WORKER_ACK',
                    actor: { type: 'REMOTE_WORKER', workerId: 'w-1', epoch: 2 },
                }),
            }),
        )

        // Simulate D1 lagging in PENDING state with 2 pending outbox records in DO
        mockDb.tasks.get('TASK-SYNC-001').current_status = 'PENDING'

        const mockEnv = {
            DB: mockDb,
            REPO_BOT_DO: {
                idFromName: (name: string) => name,
                get: (_id: string) => coordinator,
            },
        }

        // Run scheduled state reconciler
        const report = await reconcileTaskProjections(mockEnv)

        expect(report.checkedCount).toBe(1)
        expect(report.driftedCount).toBe(1)
        expect(report.repairedCount).toBe(1)
        expect(report.details[0].actionTaken).toBe('DRAINED_OUTBOX')

        // Confirm D1 has been synchronized to RUNNING
        expect(mockDb.tasks.get('TASK-SYNC-001').current_status).toBe('RUNNING')
    })

    it('TASK-4.3: state reconciler skips tasks that are already aligned', async () => {
        // Synchronize DO and D1
        await coordinator.fetch(
            new Request('https://do/fsm/claim', { method: 'POST' }),
        )
        await coordinator.fetch(
            new Request('https://do/fsm/outbox/drain', { method: 'POST' }),
        )

        const mockEnv = {
            DB: mockDb,
            REPO_BOT_DO: {
                idFromName: (name: string) => name,
                get: (_id: string) => coordinator,
            },
        }

        const report = await reconcileTaskProjections(mockEnv)
        expect(report.checkedCount).toBe(1)
        expect(report.driftedCount).toBe(0)
        expect(report.repairedCount).toBe(0)
        expect(report.details[0].actionTaken).toBe('ALIGNED')
    })

    describe('Adversarial Verification Controls (5 Non-Negotiable Invariants)', () => {
        it('Invariant 1: Atomic Staging Invariant (Zero Unstaged Transitions)', async () => {
            // Step 1: Initialize and claim task TASK-OUTBOX-01
            const testState = new MockDurableObjectState()
            const testCoordinator = new ShotCoordinatorDO(testState as any, {
                DB: mockDb,
            })
            await testCoordinator.fetch(
                new Request('https://do/fsm/initialize', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        taskId: 'TASK-OUTBOX-01',
                        branchName: 'spec/task-outbox-01',
                    }),
                }),
            )
            await testCoordinator.fetch(
                new Request('https://do/fsm/claim', { method: 'POST' }),
            )

            // Step 2: Read NVMe storage via state.storage.get('fsm_record') immediately after claim
            const record = await testState.storage.get('fsm_record')
            expect(record).toBeDefined()

            // ASSERTION: outbox.length is strictly >= 1
            expect(record.outbox.length).toBeGreaterThanOrEqual(1)

            // ASSERTION: outbox[0].toState === 'CLAIMED', outbox[0].sequenceNumber === 1, and outbox[0].epoch === 2
            expect(record.outbox[0].toState).toBe('CLAIMED')
            expect(record.outbox[0].sequenceNumber).toBe(1)
            expect(record.outbox[0].epoch).toBe(2)
        })

        it('Invariant 2: Partitioned D1 Network Failure Trap (Non-Destructive Retention)', async () => {
            const isolatedDb = new MockD1Database()
            isolatedDb.tasks.set('TASK-OUTBOX-02', {
                task_id: 'TASK-OUTBOX-02',
                current_status: 'PENDING',
                current_attempt_number: 1,
                updated_at_ms: Date.now(),
            })

            const testState = new MockDurableObjectState()
            const testEnv: any = { DB: isolatedDb, disableAutoDrain: true }
            const testCoord = new ShotCoordinatorDO(testState as any, testEnv)
            await testCoord.fetch(
                new Request('https://do/fsm/initialize', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        taskId: 'TASK-OUTBOX-02',
                        branchName: 'spec/task-outbox-02',
                    }),
                }),
            )

            // Step 1: Advance task through 3 state transitions (CLAIMED -> RUNNING -> VERIFYING)
            await testCoord.fetch(
                new Request('https://do/fsm/claim', { method: 'POST' }),
            )
            await testCoord.fetch(
                new Request('https://do/fsm/transition', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        event: 'WORKER_ACK',
                        actor: {
                            type: 'REMOTE_WORKER',
                            workerId: 'w-1',
                            epoch: 2,
                        },
                    }),
                }),
            )
            await testCoord.fetch(
                new Request('https://do/fsm/transition', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        event: 'SUBMIT_VERIFY',
                        actor: {
                            type: 'REMOTE_WORKER',
                            workerId: 'w-1',
                            epoch: 2,
                        },
                        payload: { headSha: 'aabbcc' },
                    }),
                }),
            )

            // Step 2: Simulate a total D1 partition (db.batch throws SIMULATED_D1_NETWORK_PARTITION)
            isolatedDb.shouldFailBatch = true

            // Step 3: Trigger POST /fsm/outbox/drain
            const drainRes = await testCoord.fetch(
                new Request('https://do/fsm/outbox/drain', { method: 'POST' }),
            )
            expect(drainRes.status).toBe(500)

            // ASSERTION: The request rejects or logs failure, but zero outbox records are deleted from DO storage
            const record = await testState.storage.get('fsm_record')
            expect(record.outbox.length).toBe(3)

            // ASSERTION: outboxPendingCount remains exactly 3, and each record has attempts === 1
            const ctxRes = await testCoord.fetch(
                new Request('https://do/fsm/context'),
            )
            const ctxData: any = await ctxRes.json()
            expect(ctxData.outboxPendingCount).toBe(3)
            for (const item of record.outbox) {
                expect(item.attempts).toBe(1)
            }

            // Step 4: Restore D1 connectivity and re-trigger drain
            isolatedDb.shouldFailBatch = false
            const drainRes2 = await testCoord.fetch(
                new Request('https://do/fsm/outbox/drain', { method: 'POST' }),
            )
            expect(drainRes2.status).toBe(200)
            const drainData2: any = await drainRes2.json()

            // ASSERTION: drainedCount === 3, outboxPendingCount === 0, and D1 reflects current_status === 'VERIFYING'
            expect(drainData2.drainedCount).toBe(3)
            expect(drainData2.remainingCount).toBe(0)

            const finalCtxRes = await testCoord.fetch(
                new Request('https://do/fsm/context'),
            )
            const finalCtxData: any = await finalCtxRes.json()
            expect(finalCtxData.outboxPendingCount).toBe(0)

            expect(isolatedDb.tasks.get('TASK-OUTBOX-02')?.current_status).toBe(
                'VERIFYING',
            )
        })

        it('Invariant 3: Replay Deduplication (Idempotent Projection Invariant)', async () => {
            // Step 1: Manually invoke drainOutboxBatch(db, records) with 2 valid records
            const records: OutboxRecord[] = [
                {
                    id: 'outbox-dedup-1',
                    taskId: 'TASK-DEDUP-01',
                    attemptNumber: 1,
                    sequenceNumber: 1,
                    fromState: 'PENDING',
                    toState: 'CLAIMED',
                    event: 'LEASE_CLAIMED',
                    epoch: 2,
                    actor: 'SYSTEM_INTERNAL',
                    payloadJson: '{}',
                    timestampMs: Date.now(),
                    createdAtMs: Date.now(),
                    attempts: 0,
                },
                {
                    id: 'outbox-dedup-2',
                    taskId: 'TASK-DEDUP-01',
                    attemptNumber: 1,
                    sequenceNumber: 2,
                    fromState: 'CLAIMED',
                    toState: 'RUNNING',
                    event: 'WORKER_ACK',
                    epoch: 2,
                    actor: 'REMOTE_WORKER',
                    payloadJson: '{}',
                    timestampMs: Date.now(),
                    createdAtMs: Date.now(),
                    attempts: 0,
                },
            ]

            const result1 = await drainOutboxBatch(mockDb, records)
            expect(result1.drainedCount).toBe(2)

            // Step 2: Immediately re-invoke drainOutboxBatch(db, records) with the exact same records (simulating duplicate delivery)
            const result2 = await drainOutboxBatch(mockDb, records)

            // ASSERTION: Replay completes with zero unique constraint violations
            expect(result2.drainedCount).toBe(2)

            // ASSERTION: task_events count for that task remains exactly 2 (duplicates suppressed via ON CONFLICT DO NOTHING)
            const eventsForTask = Array.from(mockDb.events.values()).filter(
                (e: any) => e.task_id === 'TASK-DEDUP-01',
            )
            expect(eventsForTask.length).toBe(2)
        })

        it('Invariant 4: Anti-Entropy Drift Healing (Reconciler Healing Loop)', async () => {
            const isolatedDb = new MockD1Database()
            // Step 1: Advance task in DO to RUNNING under attempt 1
            isolatedDb.tasks.set('TASK-HEAL-01', {
                task_id: 'TASK-HEAL-01',
                current_status: 'PENDING',
                current_attempt_number: 1,
                updated_at_ms: Date.now(),
            })

            const testState = new MockDurableObjectState()
            const testCoord = new ShotCoordinatorDO(testState as any, {
                DB: isolatedDb,
                disableAutoDrain: true,
            })
            await testCoord.fetch(
                new Request('https://do/fsm/initialize', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        taskId: 'TASK-HEAL-01',
                        branchName: 'spec/task-heal-01',
                    }),
                }),
            )
            await testCoord.fetch(
                new Request('https://do/fsm/claim', { method: 'POST' }),
            )
            await testCoord.fetch(
                new Request('https://do/fsm/transition', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        event: 'WORKER_ACK',
                        actor: {
                            type: 'REMOTE_WORKER',
                            workerId: 'w-1',
                            epoch: 2,
                        },
                    }),
                }),
            )

            // Step 2: Manually corrupt D1: set tasks.current_status = 'PENDING' while DO holds staged outbox records
            isolatedDb.tasks.get('TASK-HEAL-01').current_status = 'PENDING'

            const testEnv = {
                DB: isolatedDb,
                REPO_BOT_DO: {
                    idFromName: (name: string) => name,
                    get: (_id: string) => testCoord,
                },
            }

            // Step 3: Run reconcileTaskProjections(env)
            const report = await reconcileTaskProjections(testEnv)

            // ASSERTION: Report logs driftedCount >= 1 and repairedCount >= 1
            expect(report.driftedCount).toBeGreaterThanOrEqual(1)
            expect(report.repairedCount).toBeGreaterThanOrEqual(1)

            // ASSERTION: D1 tasks.current_status is updated to 'RUNNING', healing the divergence
            expect(isolatedDb.tasks.get('TASK-HEAL-01').current_status).toBe(
                'RUNNING',
            )
        })

        it('Invariant 5: Aligned Task Bypass (Zero Unnecessary D1 Writes)', async () => {
            const isolatedDb = new MockD1Database()
            // Step 1: Ensure DO and D1 are fully synchronized with an empty outbox
            isolatedDb.tasks.set('TASK-ALIGNED-01', {
                task_id: 'TASK-ALIGNED-01',
                current_status: 'RUNNING',
                current_attempt_number: 1,
                updated_at_ms: Date.now(),
            })

            const testState = new MockDurableObjectState()
            const testCoord = new ShotCoordinatorDO(testState as any, {
                DB: isolatedDb,
            })
            await testCoord.fetch(
                new Request('https://do/fsm/initialize', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        taskId: 'TASK-ALIGNED-01',
                        branchName: 'spec/task-aligned-01',
                    }),
                }),
            )
            await testCoord.fetch(
                new Request('https://do/fsm/claim', { method: 'POST' }),
            )
            await testCoord.fetch(
                new Request('https://do/fsm/transition', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        event: 'WORKER_ACK',
                        actor: {
                            type: 'REMOTE_WORKER',
                            workerId: 'w-1',
                            epoch: 2,
                        },
                    }),
                }),
            )
            await testCoord.fetch(
                new Request('https://do/fsm/outbox/drain', { method: 'POST' }),
            )

            const testEnv = {
                DB: isolatedDb,
                REPO_BOT_DO: {
                    idFromName: (name: string) => name,
                    get: (_id: string) => testCoord,
                },
            }

            // Reset update counter
            isolatedDb.updateCount = 0

            // Step 2: Run reconcileTaskProjections(env)
            const report = await reconcileTaskProjections(testEnv)

            // ASSERTION: Report records checkedCount >= 1, driftedCount === 0, repairedCount === 0, and actionTaken === 'ALIGNED'
            const detail = report.details.find(
                (d) => d.taskId === 'TASK-ALIGNED-01',
            )
            expect(detail).toBeDefined()
            expect(detail?.actionTaken).toBe('ALIGNED')
            expect(report.checkedCount).toBeGreaterThanOrEqual(1)
            expect(report.driftedCount).toBe(0)
            expect(report.repairedCount).toBe(0)

            // ASSERTION: Zero redundant UPDATE queries are executed against D1
            expect(isolatedDb.updateCount).toBe(0)
        })
    })
})
