-- ============================================================================
-- DIRECTIVE LEDGER SCHEMA: PRODUCTION DDL (PHASE 1)
-- ============================================================================

-- 1. Edge Transport Deduplication & Delivery Idempotency
CREATE TABLE IF NOT EXISTS idempotency_keys (
    scope TEXT NOT NULL,
    delivery_key TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('RECEIVED', 'PROCESSING', 'COMPLETED', 'FAILED')),
    attempts INTEGER NOT NULL DEFAULT 1 CHECK(attempts >= 1),
    handler_lease_expires_at_ms INTEGER NOT NULL,
    response_payload TEXT,
    last_error TEXT,
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL,
    PRIMARY KEY (scope, delivery_key)
);

-- 2. Primary Directive Task Specification & Hot Projection
CREATE TABLE IF NOT EXISTS tasks (
    task_id TEXT PRIMARY KEY,
    contract_version TEXT NOT NULL DEFAULT 'v1',
    target_repo TEXT NOT NULL,
    day_folder TEXT NOT NULL,
    sequence_num INTEGER NOT NULL,
    file_type TEXT NOT NULL CHECK(file_type IN ('JULES', 'GRAVITY', 'AG_TEST')),
    file_path TEXT NOT NULL,
    max_attempts INTEGER NOT NULL DEFAULT 3 CHECK(max_attempts >= 1),
    current_attempt_number INTEGER NOT NULL DEFAULT 1 CHECK(current_attempt_number >= 1),
    current_status TEXT NOT NULL DEFAULT 'PENDING' CHECK(current_status IN (
        'PENDING', 'CLAIMED', 'RUNNING', 'VERIFYING', 'SCOPE_PASSED',
        'AWAITING_APPROVAL', 'MERGING', 'MERGED', 'RETRYING', 'ROLLING_BACK',
        'ROLLED_BACK', 'DLQ', 'HALTED'
    )),
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL
);

-- 3. Discrete Task Execution Attempts (1-to-Many History)
CREATE TABLE IF NOT EXISTS task_attempts (
    attempt_id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    attempt_number INTEGER NOT NULL CHECK(attempt_number >= 1),
    branch_name TEXT NOT NULL,
    base_commit_sha TEXT NOT NULL,
    head_sha TEXT,
    pr_number INTEGER,
    last_projected_epoch INTEGER NOT NULL DEFAULT 1 CHECK(last_projected_epoch >= 1),
    status TEXT NOT NULL CHECK(status IN (
        'CLAIMED', 'RUNNING', 'VERIFYING', 'SCOPE_PASSED',
        'AWAITING_APPROVAL', 'MERGING', 'MERGED', 'RETRYING', 'ROLLING_BACK',
        'ROLLED_BACK', 'DLQ', 'HALTED'
    )),
    exit_reason TEXT,
    diagnostics_json TEXT,
    started_at_ms INTEGER NOT NULL,
    completed_at_ms INTEGER,
    FOREIGN KEY (task_id) REFERENCES tasks(task_id) ON DELETE CASCADE,
    UNIQUE (task_id, attempt_number)
);

-- 4. Append-Only Transition Event Audit Trail
CREATE TABLE IF NOT EXISTS task_events (
    event_id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    attempt_number INTEGER NOT NULL CHECK(attempt_number >= 1),
    sequence_number INTEGER NOT NULL CHECK(sequence_number >= 0),
    from_state TEXT NOT NULL,
    event TEXT NOT NULL,
    to_state TEXT NOT NULL,
    actor TEXT NOT NULL,
    reason TEXT,
    epoch INTEGER NOT NULL CHECK(epoch >= 1),
    payload_json TEXT NOT NULL DEFAULT '{}',
    timestamp_ms INTEGER NOT NULL,
    FOREIGN KEY (task_id) REFERENCES tasks(task_id) ON DELETE CASCADE,
    UNIQUE (task_id, sequence_number)
);

-- 5. One-Shot Cryptographic Human Approvals
CREATE TABLE IF NOT EXISTS approvals (
    approval_id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    head_sha TEXT NOT NULL,
    decision TEXT NOT NULL CHECK(decision IN ('APPROVED', 'REJECTED')),
    decided_by TEXT NOT NULL,
    reason TEXT,
    requested_at_ms INTEGER NOT NULL,
    decided_at_ms INTEGER NOT NULL,
    FOREIGN KEY (task_id) REFERENCES tasks(task_id) ON DELETE CASCADE,
    UNIQUE (task_id, head_sha)
);

-- Indices for Hot Scans and Sequential Dispatch
CREATE INDEX IF NOT EXISTS idx_tasks_day_seq ON tasks (day_folder, sequence_num);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks (current_status, updated_at_ms);
CREATE INDEX IF NOT EXISTS idx_task_attempts_task_attempt ON task_attempts (task_id, attempt_number);
CREATE INDEX IF NOT EXISTS idx_task_attempts_status ON task_attempts (status, last_projected_epoch);
CREATE INDEX IF NOT EXISTS idx_task_events_task_seq ON task_events (task_id, sequence_number);
CREATE INDEX IF NOT EXISTS idx_approvals_task_sha ON approvals (task_id, head_sha);
CREATE INDEX IF NOT EXISTS idx_idempotency_lease ON idempotency_keys (handler_lease_expires_at_ms);
