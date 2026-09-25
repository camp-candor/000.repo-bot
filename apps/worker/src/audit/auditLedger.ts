import { computeGenesisHash, computeRecordHash } from './hashChain.js'

export interface AuditEventInput {
    taskId: string
    repository: string
    eventType: string
    actorId: string
    headSha: string
    payload: any
}

export interface StoredAuditEvent {
    sequence_id: number
    task_id: string
    repository: string
    event_type: string
    actor_id: string
    head_sha: string
    payload_json: string
    prev_hash: string
    record_hash: string
    created_at: number
    drained_at: number | null
}

const INIT_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS audit_events (
    sequence_id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL,
    repository TEXT NOT NULL,
    event_type TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    head_sha TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    prev_hash TEXT NOT NULL,
    record_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    drained_at INTEGER DEFAULT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_task ON audit_events (task_id, sequence_id);
CREATE INDEX IF NOT EXISTS idx_audit_undrained ON audit_events (drained_at) WHERE drained_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_audit_repo_seq ON audit_events (repository, sequence_id DESC);
`

let isSchemaInitialized = false

/**
 * Strategy A: In-Code Self-Healing Schema Bootstrap
 * Guarantees D1 table and indexes exist on first call without requiring manual migrations.
 */
export async function ensureAuditSchema(db: any): Promise<void> {
    if (isSchemaInitialized || !db) return
    try {
        if (typeof db.exec === 'function') {
            await db.exec(INIT_SCHEMA_SQL)
            isSchemaInitialized = true
        }
    } catch (err) {
        console.error(
            '[D1_BOOTSTRAP_ERROR] Failed to auto-initialize audit schema:',
            err,
        )
    }
}

/**
 * Appends an event to the D1 Hot Transactional Ledger with SHA-256 chaining.
 */
export async function appendAuditEvent(
    db: any,
    event: AuditEventInput,
): Promise<StoredAuditEvent> {
    await ensureAuditSchema(db)
    const now = Date.now()

    // 1. Fetch latest record for this repository to retrieve Hn-1
    const lastRow = await db
        .prepare(
            'SELECT sequence_id, record_hash FROM audit_events WHERE repository = ? ORDER BY sequence_id DESC LIMIT 1',
        )
        .bind(event.repository)
        .first()

    let prevHash = lastRow?.record_hash
    if (!prevHash) {
        prevHash = await computeGenesisHash(event.repository)
    }

    // 2. Determine sequence ID
    const maxSeqRow = await db
        .prepare('SELECT MAX(sequence_id) as maxSeq FROM audit_events')
        .first()
    const nextSeq = (maxSeqRow?.maxSeq || 0) + 1

    // 3. Compute Hn
    const { recordHash, canonicalPayload } = await computeRecordHash(prevHash, {
        sequenceId: nextSeq,
        taskId: event.taskId,
        repository: event.repository,
        eventType: event.eventType,
        actorId: event.actorId,
        headSha: event.headSha,
        payload: event.payload,
        createdAt: now,
    })

    // 4. Insert into D1
    await db
        .prepare(
            `INSERT INTO audit_events
            (sequence_id, task_id, repository, event_type, actor_id, head_sha, payload_json, prev_hash, record_hash, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
            nextSeq,
            event.taskId,
            event.repository,
            event.eventType,
            event.actorId,
            event.headSha,
            canonicalPayload,
            prevHash,
            recordHash,
            now,
        )
        .run()

    return {
        sequence_id: nextSeq,
        task_id: event.taskId,
        repository: event.repository,
        event_type: event.eventType,
        actor_id: event.actorId,
        head_sha: event.headSha,
        payload_json: canonicalPayload,
        prev_hash: prevHash,
        record_hash: recordHash,
        created_at: now,
        drained_at: null,
    }
}
