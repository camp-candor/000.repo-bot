-- Hot Transactional Audit Ledger
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
