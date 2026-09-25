export interface StoredJulesSession {
    session_id: string
    repo: string
    task_id: string
    branch_name: string
    status: string
    last_status: string | null
    last_prompt: string | null
    created_at: number
    updated_at: number
}

const INIT_JULES_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS jules_sessions (
    session_id TEXT PRIMARY KEY,
    repo TEXT NOT NULL,
    task_id TEXT NOT NULL,
    branch_name TEXT NOT NULL,
    status TEXT NOT NULL,
    last_status TEXT DEFAULT NULL,
    last_prompt TEXT DEFAULT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_jules_active ON jules_sessions (status) WHERE status NOT IN ('COMPLETED', 'FAILED');
`

let isJulesSchemaInitialized = false

export async function ensureJulesSchema(db: any): Promise<void> {
    if (isJulesSchemaInitialized || !db) return
    try {
        if (typeof db.exec === 'function') {
            await db.exec(INIT_JULES_SCHEMA_SQL)
            isJulesSchemaInitialized = true
        }
    } catch (err) {
        console.error(
            '[JULES_D1_BOOTSTRAP_ERROR] Failed to init jules_sessions schema:',
            err,
        )
    }
}

export async function recordJulesSession(
    db: any,
    session: {
        sessionId: string
        repo: string
        taskId: string
        branchName: string
        status?: string
        prompt?: string
    },
): Promise<void> {
    if (!db) return
    await ensureJulesSchema(db)
    const now = Date.now()

    await db
        .prepare(
            `INSERT INTO jules_sessions (session_id, repo, task_id, branch_name, status, last_status, last_prompt, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(session_id) DO UPDATE SET
            status = excluded.status,
            updated_at = excluded.updated_at`,
        )
        .bind(
            session.sessionId,
            session.repo,
            session.taskId,
            session.branchName,
            session.status || 'RUNNING',
            null,
            session.prompt || null,
            now,
            now,
        )
        .run()
}
