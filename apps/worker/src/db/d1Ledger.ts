export interface TaskLedgerSnapshot {
    taskId: string
    status: string
    currentEpoch: number
    artistId: string
    workflowTemplate: string
    canonicalKey?: string | null
    sha256?: string | null
    attemptCount: number
    createdAtMs: number
    updatedAtMs: number
}

export interface StateTransitionRecord {
    taskId: string
    fromState: string
    toState: string
    epoch: number
    workerId?: string | null
    timestampMs: number
    metadata?: Record<string, any>
}

export interface D1DatabaseInterface {
    prepare(query: string): D1PreparedStatementInterface
    exec(query: string): Promise<any>
}

export interface D1PreparedStatementInterface {
    bind(...values: any[]): D1PreparedStatementInterface
    run(): Promise<{ success: boolean; error?: string }>
    all<T = any>(): Promise<{ results: T[]; success: boolean; error?: string }>
    first<T = any>(): Promise<T | null>
}

export const D1_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS task_ledger (
    task_id TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    current_epoch INTEGER NOT NULL,
    artist_id TEXT NOT NULL,
    workflow_template TEXT NOT NULL,
    canonical_key TEXT,
    sha256 TEXT,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS task_transitions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL,
    from_state TEXT NOT NULL,
    to_state TEXT NOT NULL,
    epoch INTEGER NOT NULL,
    worker_id TEXT,
    timestamp_ms INTEGER NOT NULL,
    metadata_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_transitions_task ON task_transitions(task_id, timestamp_ms);

CREATE TABLE IF NOT EXISTS fleet_workers (
    worker_id TEXT PRIMARY KEY,
    hostname TEXT NOT NULL,
    gpu_model TEXT NOT NULL,
    vram_total_mb INTEGER NOT NULL,
    vram_free_mb INTEGER NOT NULL,
    status TEXT NOT NULL,
    active_task_id TEXT,
    registered_at_ms INTEGER NOT NULL,
    last_heartbeat_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_fleet_status ON fleet_workers(status, vram_free_mb);
`

export class D1StateLedger {
    constructor(private db: D1DatabaseInterface) {}

    /**
     * Initializes the relational database schema idempotently.
     */
    public async initializeSchema(): Promise<void> {
        try {
            await this.db.exec(D1_SCHEMA_SQL)
            console.log(
                '>> [D1:MIGRATE] Initialized relational tables in Cloudflare D1 [OK]',
            )
        } catch (err: any) {
            console.error(`>> [D1:ERR] Migration failed: ${err.message} [FAIL]`)
            throw err
        }
    }

    /**
     * Upserts the latest state snapshot for a given task.
     */
    public async recordTaskSnapshot(
        snapshot: TaskLedgerSnapshot,
    ): Promise<void> {
        const query = `
            INSERT INTO task_ledger (
                task_id, status, current_epoch, artist_id, workflow_template,
                canonical_key, sha256, attempt_count, created_at_ms, updated_at_ms
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(task_id) DO UPDATE SET
                status = excluded.status,
                current_epoch = excluded.current_epoch,
                canonical_key = excluded.canonical_key,
                sha256 = excluded.sha256,
                attempt_count = excluded.attempt_count,
                updated_at_ms = excluded.updated_at_ms;
        `

        await this.db
            .prepare(query)
            .bind(
                snapshot.taskId,
                snapshot.status,
                snapshot.currentEpoch,
                snapshot.artistId,
                snapshot.workflowTemplate,
                snapshot.canonicalKey ?? null,
                snapshot.sha256 ?? null,
                snapshot.attemptCount,
                snapshot.createdAtMs,
                snapshot.updatedAtMs,
            )
            .run()

        console.log(
            `>> [D1_LEDGER:SNAPSHOT] Mirrored task '${snapshot.taskId}' (${snapshot.status}, Epoch ${snapshot.currentEpoch}) [OK]`,
        )
    }

    /**
     * Records an immutable state transition event into the audit ledger.
     */
    public async recordStateTransition(
        transition: StateTransitionRecord,
    ): Promise<void> {
        const query = `
            INSERT INTO task_transitions (
                task_id, from_state, to_state, epoch, worker_id, timestamp_ms, metadata_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?);
        `

        const metadataJson = transition.metadata
            ? JSON.stringify(transition.metadata)
            : null

        await this.db
            .prepare(query)
            .bind(
                transition.taskId,
                transition.fromState,
                transition.toState,
                transition.epoch,
                transition.workerId ?? null,
                transition.timestampMs,
                metadataJson,
            )
            .run()

        console.log(
            `>> [D1_LEDGER:TRANSITION] Task '${transition.taskId}': ${transition.fromState} -> ${transition.toState} (Epoch ${transition.epoch}) [OK]`,
        )
    }

    /**
     * Retrieves all transition audit records for a given task in chronological order.
     */
    public async queryTaskHistory(
        taskId: string,
    ): Promise<StateTransitionRecord[]> {
        const query = `
            SELECT task_id, from_state, to_state, epoch, worker_id, timestamp_ms, metadata_json
            FROM task_transitions
            WHERE task_id = ?
            ORDER BY timestamp_ms ASC, id ASC;
        `

        const res = await this.db.prepare(query).bind(taskId).all<any>()
        if (!res.results) return []

        return res.results.map((row) => ({
            taskId: row.task_id,
            fromState: row.from_state,
            toState: row.to_state,
            epoch: Number(row.epoch),
            workerId: row.worker_id,
            timestampMs: Number(row.timestamp_ms),
            metadata: row.metadata_json
                ? JSON.parse(row.metadata_json)
                : undefined,
        }))
    }
}
