import { describe, it, expect, beforeEach } from 'vitest'
import {
    D1StateLedger,
    type D1DatabaseInterface,
    type D1PreparedStatementInterface,
} from '../../src/db/d1Ledger.js'
import { FleetRegistry } from '../../src/fleet/fleetRegistry.js'
import { ShotCoordinatorDO } from '../../src/objects/ShotCoordinatorDO.js'

class MockD1Database implements D1DatabaseInterface {
    public executedQueries: string[] = []
    public taskLedger = new Map<string, any>()
    public taskTransitions: any[] = []
    public fleetWorkers = new Map<string, any>()

    async exec(query: string): Promise<any> {
        this.executedQueries.push(query)
        return { success: true }
    }

    prepare(query: string): D1PreparedStatementInterface {
        const self = this
        let boundValues: any[] = []

        const stmt: D1PreparedStatementInterface = {
            bind(...values: any[]) {
                boundValues = values
                return stmt
            },
            async run() {
                if (query.includes('INSERT INTO task_ledger')) {
                    const [
                        taskId,
                        status,
                        epoch,
                        artistId,
                        template,
                        canKey,
                        sha,
                        attempts,
                        created,
                        updated,
                    ] = boundValues
                    self.taskLedger.set(taskId, {
                        task_id: taskId,
                        status,
                        current_epoch: epoch,
                        artist_id: artistId,
                        workflow_template: template,
                        canonical_key: canKey,
                        sha256: sha,
                        attempt_count: attempts,
                        created_at_ms: created,
                        updated_at_ms: updated,
                    })
                } else if (query.includes('INSERT INTO task_transitions')) {
                    const [
                        taskId,
                        fromState,
                        toState,
                        epoch,
                        workerId,
                        timestamp,
                        metadataJson,
                    ] = boundValues
                    self.taskTransitions.push({
                        id: self.taskTransitions.length + 1,
                        task_id: taskId,
                        from_state: fromState,
                        to_state: toState,
                        epoch,
                        worker_id: workerId,
                        timestamp_ms: timestamp,
                        metadata_json: metadataJson,
                    })
                } else if (query.includes('INSERT INTO fleet_workers')) {
                    const [
                        workerId,
                        hostname,
                        gpuModel,
                        vramTotal,
                        vramFree,
                        regAt,
                        lastHeartbeat,
                    ] = boundValues
                    self.fleetWorkers.set(workerId, {
                        worker_id: workerId,
                        hostname,
                        gpu_model: gpuModel,
                        vram_total_mb: vramTotal,
                        vram_free_mb: vramFree,
                        status: 'ONLINE',
                        active_task_id: null,
                        registered_at_ms: regAt,
                        last_heartbeat_ms: lastHeartbeat,
                    })
                } else if (
                    query.includes('UPDATE fleet_workers') &&
                    query.includes('status = ?')
                ) {
                    const [vramFree, activeTask, status, now, workerId] =
                        boundValues
                    const w = self.fleetWorkers.get(workerId)
                    if (w) {
                        w.vram_free_mb = vramFree
                        w.active_task_id = activeTask
                        w.status = status
                        w.last_heartbeat_ms = now
                    }
                } else if (
                    query.includes('UPDATE fleet_workers') &&
                    query.includes("status = 'OFFLINE'")
                ) {
                    const [threshold] = boundValues
                    for (const w of self.fleetWorkers.values()) {
                        if (
                            w.status !== 'OFFLINE' &&
                            w.last_heartbeat_ms < threshold
                        ) {
                            w.status = 'OFFLINE'
                            w.active_task_id = null
                        }
                    }
                }
                return { success: true }
            },
            async all<T = any>() {
                if (query.includes('FROM task_transitions')) {
                    const [taskId] = boundValues
                    const filtered = self.taskTransitions.filter(
                        (t) => t.task_id === taskId,
                    )
                    return { results: filtered as T[], success: true }
                } else if (
                    query.includes('SELECT worker_id FROM fleet_workers')
                ) {
                    const [threshold] = boundValues
                    const stale = Array.from(self.fleetWorkers.values())
                        .filter(
                            (w) =>
                                w.status !== 'OFFLINE' &&
                                w.last_heartbeat_ms < threshold,
                        )
                        .map((w) => ({ worker_id: w.worker_id }))
                    return { results: stale as T[], success: true }
                } else if (
                    query.includes("status = 'ONLINE'") &&
                    query.includes('vram_free_mb >=')
                ) {
                    const [minVram] = boundValues
                    const eligible = Array.from(
                        self.fleetWorkers.values(),
                    ).filter(
                        (w) =>
                            w.status === 'ONLINE' && w.vram_free_mb >= minVram,
                    )
                    return { results: eligible as T[], success: true }
                }
                return { results: [], success: true }
            },
            async first<T = any>(): Promise<T | null> {
                return null
            },
        }
        return stmt
    }
}

class MockDurableObjectStorage {
    public store = new Map<string, any>()
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
    async deleteAlarm(): Promise<void> {}
}

class MockDurableObjectContext {
    public storage = new MockDurableObjectStorage()
    public waitUntils: Promise<any>[] = []
    blockConcurrencyWhile(fn: () => Promise<any>): Promise<any> {
        return fn()
    }
    waitUntil(promise: Promise<any>): void {
        this.waitUntils.push(promise)
        promise.catch(() => {})
    }
    async flushWaitUntil(): Promise<void> {
        await Promise.all(this.waitUntils)
    }
}

describe('D1 State Ledger & Fleet Ingestion Battery (Phase 1)', () => {
    let mockDb: MockD1Database
    let ledger: D1StateLedger
    let fleet: FleetRegistry

    beforeEach(() => {
        mockDb = new MockD1Database()
        ledger = new D1StateLedger(mockDb)
        fleet = new FleetRegistry(mockDb)
    })

    it('INVARIANT 1: initializes D1 relational schema idempotently twice consecutively', async () => {
        // Call initializeSchema twice consecutively on clean DB mock
        await ledger.initializeSchema()
        await ledger.initializeSchema()

        expect(mockDb.executedQueries.length).toBe(2)
        for (const q of mockDb.executedQueries) {
            expect(q).toContain('CREATE TABLE IF NOT EXISTS task_ledger')
            expect(q).toContain('CREATE TABLE IF NOT EXISTS task_transitions')
            expect(q).toContain('CREATE TABLE IF NOT EXISTS fleet_workers')
            expect(q).toContain(
                'CREATE INDEX IF NOT EXISTS idx_transitions_task',
            )
            expect(q).toContain('CREATE INDEX IF NOT EXISTS idx_fleet_status')
        }
    })

    it('INVARIANT 2: upserts task snapshot and maintains chronological transition sequence', async () => {
        // 1. Initial snapshot in PENDING
        await ledger.recordTaskSnapshot({
            taskId: 'shot-d1-01',
            status: 'PENDING',
            currentEpoch: 1,
            artistId: 'artist_alpha',
            workflowTemplate: 'wan.json',
            attemptCount: 0,
            createdAtMs: 1000,
            updatedAtMs: 1000,
        })

        expect(mockDb.taskLedger.get('shot-d1-01')).toBeDefined()
        expect(mockDb.taskLedger.get('shot-d1-01').status).toBe('PENDING')

        // 2. Append transitions: NONE -> PENDING, PENDING -> RUNNING, RUNNING -> VERIFYING
        await ledger.recordStateTransition({
            taskId: 'shot-d1-01',
            fromState: 'NONE',
            toState: 'PENDING',
            epoch: 1,
            workerId: null,
            timestampMs: 1000,
        })

        await ledger.recordStateTransition({
            taskId: 'shot-d1-01',
            fromState: 'PENDING',
            toState: 'RUNNING',
            epoch: 1,
            workerId: 'rig2_gpu',
            timestampMs: 1050,
        })

        await ledger.recordStateTransition({
            taskId: 'shot-d1-01',
            fromState: 'RUNNING',
            toState: 'VERIFYING',
            epoch: 1,
            workerId: 'rig2_gpu',
            timestampMs: 1200,
        })

        // Upsert snapshot to VERIFYING
        await ledger.recordTaskSnapshot({
            taskId: 'shot-d1-01',
            status: 'VERIFYING',
            currentEpoch: 1,
            artistId: 'artist_alpha',
            workflowTemplate: 'wan.json',
            canonicalKey: 'canonical/renders/shot-d1-01/abc.mp4',
            sha256: 'abc12345',
            attemptCount: 1,
            createdAtMs: 1000,
            updatedAtMs: 1200,
        })

        expect(mockDb.taskLedger.get('shot-d1-01').status).toBe('VERIFYING')

        const history = await ledger.queryTaskHistory('shot-d1-01')
        expect(history).toHaveLength(3)
        expect(history[0].fromState).toBe('NONE')
        expect(history[0].toState).toBe('PENDING')
        expect(history[1].fromState).toBe('PENDING')
        expect(history[1].toState).toBe('RUNNING')
        expect(history[2].fromState).toBe('RUNNING')
        expect(history[2].toState).toBe('VERIFYING')
    })

    it('INVARIANT 3: validates fleet hardware ingestion and rejects corrupt registrations', async () => {
        // Empty workerId rejects
        await expect(
            fleet.registerWorker({
                workerId: '',
                hostname: 'rig1',
                gpuModel: 'RTX 4090',
                vramTotalMb: 24576,
            }),
        ).rejects.toThrow('FLEET_REGISTER_ERROR')

        // Negative VRAM rejects
        await expect(
            fleet.registerWorker({
                workerId: 'rig1',
                hostname: 'rig1',
                gpuModel: 'RTX 4090',
                vramTotalMb: -100,
            }),
        ).rejects.toThrow('FLEET_REGISTER_ERROR')

        // Valid registration succeeds
        await fleet.registerWorker({
            workerId: 'rig1',
            hostname: 'rig1.local',
            gpuModel: 'RTX 4090',
            vramTotalMb: 24576,
        })

        const w = mockDb.fleetWorkers.get('rig1')
        expect(w).toBeDefined()
        expect(w.status).toBe('ONLINE')
        expect(w.vram_free_mb).toBe(24576)
    })

    it('INVARIANT 4: dynamic telemetry heartbeat updates and toggles ONLINE/BUSY state', async () => {
        await fleet.registerWorker({
            workerId: 'rig2_gpu_foundry',
            hostname: 'rig2.local',
            gpuModel: 'NVIDIA RTX 4090',
            vramTotalMb: 24576,
            vramFreeMb: 22000,
        })

        const worker = mockDb.fleetWorkers.get('rig2_gpu_foundry')
        expect(worker).toBeDefined()
        expect(worker.status).toBe('ONLINE')

        // Heartbeat with active task flips status to BUSY
        await fleet.recordHeartbeat('rig2_gpu_foundry', 18000, 'shot-042')
        expect(worker.status).toBe('BUSY')
        expect(worker.vram_free_mb).toBe(18000)
        expect(worker.active_task_id).toBe('shot-042')

        // Heartbeat without active task reverts status to ONLINE
        await fleet.recordHeartbeat('rig2_gpu_foundry', 24000, null)
        expect(worker.status).toBe('ONLINE')
        expect(worker.vram_free_mb).toBe(24000)
        expect(worker.active_task_id).toBeNull()
    })

    it('INVARIANT 5: evicts stale runners exceeding 60-second cutoff to OFFLINE', async () => {
        await fleet.registerWorker({
            workerId: 'rig1_stale',
            hostname: 'rig1.local',
            gpuModel: 'NVIDIA RTX 3090',
            vramTotalMb: 24576,
        })

        const w = mockDb.fleetWorkers.get('rig1_stale')
        w.last_heartbeat_ms = Date.now() - 75_000 // 75 seconds ago

        const reaped = await fleet.reapStaleWorkers(60_000)
        expect(reaped).toContain('rig1_stale')
        expect(w.status).toBe('OFFLINE')
        expect(w.active_task_id).toBeNull()
    })

    it('INVARIANT 6: ShotCoordinatorDO non-blocking mirroring and fleet endpoints', async () => {
        const mockCtx = new MockDurableObjectContext()
        const coordinator = new ShotCoordinatorDO(mockCtx as any, {
            DB: mockDb,
        })

        // Register fleet worker via DO endpoint
        const regRes = await coordinator.fetch(
            new Request('https://do.internal/fleet/register', {
                method: 'POST',
                body: JSON.stringify({
                    workerId: 'rig2_gpu',
                    hostname: 'rig2.local',
                    gpuModel: 'RTX 4090',
                    vramTotalMb: 24576,
                    vramFreeMb: 24576,
                }),
            }),
        )
        expect(regRes.status).toBe(200)

        // Enqueue
        const enqRes = await coordinator.fetch(
            new Request('https://do.internal/enqueue', {
                method: 'POST',
                body: JSON.stringify({
                    taskId: 'shot-e2e-d1',
                    artistId: 'artist_paris',
                    idempotencyKey: 'idemp-d1',
                }),
            }),
        )
        expect(enqRes.status).toBe(200)

        expect(mockDb.taskLedger.get('shot-e2e-d1')).toBeDefined()
        expect(mockDb.taskLedger.get('shot-e2e-d1').status).toBe('PENDING')

        // Claim Lease
        const claimRes = await coordinator.fetch(
            new Request('https://do.internal/leases/claim', {
                method: 'POST',
                body: JSON.stringify({ workerId: 'rig2_gpu' }),
            }),
        )
        expect(claimRes.status).toBe(200)
        expect(mockDb.taskLedger.get('shot-e2e-d1').status).toBe('RUNNING')

        // Complete Task
        const compRes = await coordinator.fetch(
            new Request('https://do.internal/tasks/complete', {
                method: 'POST',
                body: JSON.stringify({
                    epoch: 1,
                    stagingKey: 'staging/renders/shot-e2e-d1/epoch_1_abc.mp4',
                    sha256: 'abc987654321',
                    workerId: 'rig2_gpu',
                }),
            }),
        )
        expect(compRes.status).toBe(200)

        // Flush asynchronous background waitUntil promises to verify mirrored D1 state
        await mockCtx.flushWaitUntil()

        expect(mockDb.taskLedger.get('shot-e2e-d1')).toBeDefined()
        expect(mockDb.taskLedger.get('shot-e2e-d1').status).toBe('VERIFYING')
        expect(mockDb.taskLedger.get('shot-e2e-d1').sha256).toBe('abc987654321')

        // Query eligible fleet workers via DO endpoint
        const workersRes = await coordinator.fetch(
            new Request('https://do.internal/fleet/workers?minVram=16000', {
                method: 'GET',
            }),
        )
        expect(workersRes.status).toBe(200)
        const workersJson = (await workersRes.json()) as any
        expect(workersJson.ok).toBe(true)
        expect(workersJson.workers.length).toBeGreaterThan(0)
    })
})
