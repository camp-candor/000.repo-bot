export type DirectiveFileType = 'JULES' | 'GRAVITY' | 'AG_TEST'

export type TaskStatus =
  | 'PENDING'
  | 'CLAIMED'
  | 'RUNNING'
  | 'VERIFYING'
  | 'SCOPE_PASSED'
  | 'AWAITING_APPROVAL'
  | 'MERGING'
  | 'MERGED'
  | 'RETRYING'
  | 'ROLLING_BACK'
  | 'ROLLED_BACK'
  | 'DLQ'
  | 'HALTED'

export interface TaskRecord {
  task_id: string
  contract_version: string
  target_repo: string
  day_folder: string
  sequence_num: number
  file_type: DirectiveFileType
  file_path: string
  max_attempts: number
  current_attempt_number: number
  current_status: TaskStatus
  created_at_ms: number
  updated_at_ms: number
}

export interface TaskAttemptRecord {
  attempt_id: string
  task_id: string
  attempt_number: number
  branch_name: string
  base_commit_sha: string
  head_sha: string | null
  pr_number: number | null
  last_projected_epoch: number
  status: TaskStatus
  exit_reason: string | null
  diagnostics_json: string | null
  started_at_ms: number
  completed_at_ms: number | null
}

export interface TaskEventInput {
  eventId?: string
  taskId: string
  attemptNumber: number
  sequenceNumber: number
  fromState: TaskStatus
  event: string
  toState: TaskStatus
  actor: string
  reason?: string
  epoch: number
  payload?: Record<string, unknown>
  timestampMs?: number
}

export interface OneShotApprovalInput {
  approvalId?: string
  taskId: string
  headSha: string
  decision: 'APPROVED' | 'REJECTED'
  decidedBy: string
  reason?: string
  requestedAtMs?: number
  decidedAtMs?: number
}

const INIT_DIRECTIVE_LEDGER_SQL = `
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

CREATE INDEX IF NOT EXISTS idx_tasks_day_seq ON tasks (day_folder, sequence_num);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks (current_status, updated_at_ms);
CREATE INDEX IF NOT EXISTS idx_task_attempts_task_attempt ON task_attempts (task_id, attempt_number);
CREATE INDEX IF NOT EXISTS idx_task_attempts_status ON task_attempts (status, last_projected_epoch);
CREATE INDEX IF NOT EXISTS idx_task_events_task_seq ON task_events (task_id, sequence_number);
CREATE INDEX IF NOT EXISTS idx_approvals_task_sha ON approvals (task_id, head_sha);
CREATE INDEX IF NOT EXISTS idx_idempotency_lease ON idempotency_keys (handler_lease_expires_at_ms);
`

let isSchemaInitialized = false

/**
 * Strategy A: In-Code Self-Healing Schema Bootstrapper for Directive Ledger.
 */
export async function ensureDirectiveLedgerSchema(db: any): Promise<void> {
  if (isSchemaInitialized || !db) return
  try {
    if (typeof db.exec === 'function') {
      await db.exec(INIT_DIRECTIVE_LEDGER_SQL)
      isSchemaInitialized = true
    }
  } catch (err: any) {
    console.error(
      '[DIRECTIVE_D1_BOOTSTRAP_ERROR] Failed to auto-initialize directive schema:',
      err.message,
    )
    throw err
  }
}

/**
 * Resets the in-memory schema initialized guard (primarily for unit test environments).
 */
export function resetSchemaInitializationGuard(): void {
  isSchemaInitialized = false
}

/**
 * Registers a new directive task specification or updates its path configuration.
 */
export async function registerDirectiveTask(
  db: any,
  spec: {
    taskId: string
    contractVersion?: string
    targetRepo: string
    dayFolder: string
    sequenceNum: number
    fileType: DirectiveFileType
    filePath: string
    maxAttempts?: number
  },
): Promise<TaskRecord> {
  await ensureDirectiveLedgerSchema(db)
  const now = Date.now()
  const contractVersion = spec.contractVersion || 'v1'
  const maxAttempts = spec.maxAttempts ?? 3

  await db
    .prepare(
      `INSERT INTO tasks (
            task_id, contract_version, target_repo, day_folder, sequence_num,
            file_type, file_path, max_attempts, current_attempt_number,
            current_status, created_at_ms, updated_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'PENDING', ?, ?)
        ON CONFLICT(task_id) DO UPDATE SET
            target_repo = excluded.target_repo,
            file_path = excluded.file_path,
            max_attempts = excluded.max_attempts,
            updated_at_ms = excluded.updated_at_ms`,
    )
    .bind(
      spec.taskId,
      contractVersion,
      spec.targetRepo,
      spec.dayFolder,
      spec.sequenceNum,
      spec.fileType,
      spec.filePath,
      maxAttempts,
      now,
      now,
    )
    .run()

  return {
    task_id: spec.taskId,
    contract_version: contractVersion,
    target_repo: spec.targetRepo,
    day_folder: spec.dayFolder,
    sequence_num: spec.sequenceNum,
    file_type: spec.fileType,
    file_path: spec.filePath,
    max_attempts: maxAttempts,
    current_attempt_number: 1,
    current_status: 'PENDING',
    created_at_ms: now,
    updated_at_ms: now,
  }
}

/**
 * Claims a task attempt and registers the epoch-isolated branch tracking row.
 */
export async function claimTaskAttempt(
  db: any,
  params: {
    taskId: string
    attemptNumber: number
    branchName: string
    baseCommitSha: string
    epoch: number
  },
): Promise<TaskAttemptRecord> {
  await ensureDirectiveLedgerSchema(db)
  const now = Date.now()
  const attemptId = `att-${params.taskId}-${params.attemptNumber}`

  const statements = [
    db
      .prepare(
        `INSERT INTO task_attempts (
                attempt_id, task_id, attempt_number, branch_name, base_commit_sha,
                last_projected_epoch, status, started_at_ms
            ) VALUES (?, ?, ?, ?, ?, ?, 'CLAIMED', ?)
            ON CONFLICT(task_id, attempt_number) DO UPDATE SET
                branch_name = excluded.branch_name,
                base_commit_sha = excluded.base_commit_sha,
                last_projected_epoch = excluded.last_projected_epoch,
                status = 'CLAIMED'`,
      )
      .bind(
        attemptId,
        params.taskId,
        params.attemptNumber,
        params.branchName,
        params.baseCommitSha,
        params.epoch,
        now,
      ),
    db
      .prepare(
        `UPDATE tasks
             SET current_attempt_number = ?, current_status = 'CLAIMED', updated_at_ms = ?
             WHERE task_id = ?`,
      )
      .bind(params.attemptNumber, now, params.taskId),
    db
      .prepare(
        `INSERT INTO task_events (
                event_id, task_id, attempt_number, sequence_number, from_state,
                event, to_state, actor, epoch, timestamp_ms
            ) VALUES (?, ?, ?, COALESCE((SELECT MAX(sequence_number) + 1 FROM task_events WHERE task_id = ?), 0), 'PENDING', 'TASK_CLAIMED', 'CLAIMED', 'system', ?, ?)`,
      )
      .bind(
        `evt-${params.taskId}-${params.attemptNumber}-0`,
        params.taskId,
        params.attemptNumber,
        params.taskId,
        params.epoch,
        now,
      ),
  ]

  await db.batch(statements)

  return {
    attempt_id: attemptId,
    task_id: params.taskId,
    attempt_number: params.attemptNumber,
    branch_name: params.branchName,
    base_commit_sha: params.baseCommitSha,
    head_sha: null,
    pr_number: null,
    last_projected_epoch: params.epoch,
    status: 'CLAIMED',
    exit_reason: null,
    diagnostics_json: null,
    started_at_ms: now,
    completed_at_ms: null,
  }
}

/**
 * Appends a transition event to task_events and synchronizes the current_status projection.
 */
export async function recordTaskEvent(
  db: any,
  input: TaskEventInput,
): Promise<void> {
  await ensureDirectiveLedgerSchema(db)
  const now = input.timestampMs || Date.now()
  const eventId =
    input.eventId ||
    `evt-${input.taskId}-${input.attemptNumber}-${input.sequenceNumber}`
  const payloadJson = input.payload ? JSON.stringify(input.payload) : '{}'

  const statements = [
    db
      .prepare(
        `INSERT INTO task_events (
                event_id, task_id, attempt_number, sequence_number, from_state,
                event, to_state, actor, reason, epoch, payload_json, timestamp_ms
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        eventId,
        input.taskId,
        input.attemptNumber,
        input.sequenceNumber,
        input.fromState,
        input.event,
        input.toState,
        input.actor,
        input.reason || null,
        input.epoch,
        payloadJson,
        now,
      ),
    db
      .prepare(
        `UPDATE tasks
             SET current_status = ?, updated_at_ms = ?
             WHERE task_id = ?`,
      )
      .bind(input.toState, now, input.taskId),
    db
      .prepare(
        `UPDATE task_attempts
             SET status = ?,
                 last_projected_epoch = ?,
                 exit_reason = COALESCE(?, exit_reason),
                 completed_at_ms = CASE WHEN ? IN ('MERGED', 'ROLLED_BACK', 'DLQ', 'HALTED') THEN ? ELSE completed_at_ms END
             WHERE task_id = ? AND attempt_number = ?`,
      )
      .bind(
        input.toState,
        input.epoch,
        input.reason || null,
        input.toState,
        now,
        input.taskId,
        input.attemptNumber,
      ),
  ]

  await db.batch(statements)
}

/**
 * Records an immutable one-shot human sign-off bound strictly to (task_id, head_sha).
 */
export async function recordOneShotApproval(
  db: any,
  input: OneShotApprovalInput,
): Promise<void> {
  await ensureDirectiveLedgerSchema(db)
  const now = input.decidedAtMs || Date.now()
  const requestedAt = input.requestedAtMs || now
  const approvalId =
    input.approvalId || `appr-${input.taskId}-${input.headSha.slice(0, 10)}`

  await db
    .prepare(
      `INSERT INTO approvals (
            approval_id, task_id, head_sha, decision, decided_by, reason,
            requested_at_ms, decided_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      approvalId,
      input.taskId,
      input.headSha,
      input.decision,
      input.decidedBy,
      input.reason || null,
      requestedAt,
      now,
    )
    .run()
}

/**
 * Queries the next unmerged directive task for a given day folder in sequential order.
 */
export async function queryNextDirectiveTask(
  db: any,
  dayFolder: string,
): Promise<TaskRecord | null> {
  await ensureDirectiveLedgerSchema(db)

  const result = await db
    .prepare(
      `SELECT task_id, contract_version, target_repo, day_folder, sequence_num,
                file_type, file_path, max_attempts, current_attempt_number,
                current_status, created_at_ms, updated_at_ms
         FROM tasks
         WHERE day_folder = ? AND current_status != 'MERGED'
         ORDER BY sequence_num ASC
         LIMIT 1`,
    )
    .bind(dayFolder)
    .first()

  return result ? (result as TaskRecord) : null
}