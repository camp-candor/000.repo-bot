export type IdempotencyStatus =
    'RECEIVED' | 'PROCESSING' | 'COMPLETED' | 'FAILED'

export interface IdempotencyRecord {
    key: string
    scope: string
    status: IdempotencyStatus
    handler_lease_expires_at: number
    response_payload: string | null
    created_at: number
    updated_at: number
}

export interface IdempotencyEvaluation {
    isUnique: boolean
    isReclaimed: boolean
    status: IdempotencyStatus
    cachedResponse?: any
}

/**
 * Bootstraps the idempotency ledger schema in Cloudflare D1.
 */
export async function ensureIdempotencySchema(db: any): Promise<void> {
    await db.exec(`
        CREATE TABLE IF NOT EXISTS idempotency_keys (
            key TEXT PRIMARY KEY,
            scope TEXT NOT NULL,
            status TEXT CHECK(status IN ('RECEIVED', 'PROCESSING', 'COMPLETED', 'FAILED')) NOT NULL,
            handler_lease_expires_at INTEGER NOT NULL,
            response_payload TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_idempotency_scope ON idempotency_keys(scope);
        CREATE INDEX IF NOT EXISTS idx_idempotency_lease ON idempotency_keys(status, handler_lease_expires_at);
        CREATE INDEX IF NOT EXISTS idx_idempotency_created ON idempotency_keys(created_at);
    `)
}

/**
 * Two-phase transport idempotency gate. Evaluates delivery uniqueness and reclaims expired leases.
 * Database errors are NOT caught here: they must propagate so the edge handler returns HTTP 5xx.
 */
export async function evaluateTransportIdempotency(
    db: any,
    params: {
        key: string
        scope: string
        leaseTtlMs?: number
    },
): Promise<IdempotencyEvaluation> {
    const { key, scope, leaseTtlMs = 60_000 } = params
    const now = Date.now()
    const leaseExpiresAt = now + leaseTtlMs

    await ensureIdempotencySchema(db)

    // 1. Atomic insertion gate
    const insertRes = await db
        .prepare(
            `INSERT INTO idempotency_keys (
            key, scope, status, handler_lease_expires_at, response_payload, created_at, updated_at
        ) VALUES (?, ?, 'RECEIVED', ?, NULL, ?, ?)
        ON CONFLICT(key) DO NOTHING`,
        )
        .bind(key, scope, leaseExpiresAt, now, now)
        .run()

    if (insertRes?.meta?.changes === 1) {
        return {
            isUnique: true,
            isReclaimed: false,
            status: 'RECEIVED',
        }
    }

    // 2. Conflict resolution: Fetch existing record
    const existing = (await db
        .prepare(
            `SELECT key, scope, status, handler_lease_expires_at, response_payload, created_at, updated_at
         FROM idempotency_keys
         WHERE key = ?`,
        )
        .bind(key)
        .first()) as IdempotencyRecord | null

    if (!existing) {
        // Fallback safety if row vanished between insert and select
        return { isUnique: false, isReclaimed: false, status: 'FAILED' }
    }

    if (existing.status === 'COMPLETED') {
        let cachedResponse: any = null
        if (existing.response_payload) {
            try {
                cachedResponse = JSON.parse(existing.response_payload)
            } catch {
                cachedResponse = existing.response_payload
            }
        }
        console.log(
            `>> [IDEMPOTENCY:DUPLICATE] Key '${key}' already COMPLETED :: serving cached response`,
        )
        return {
            isUnique: false,
            isReclaimed: false,
            status: 'COMPLETED',
            cachedResponse,
        }
    }

    // 3. Crash recovery check: Has the handler lease expired?
    if (
        existing.handler_lease_expires_at < now &&
        (existing.status === 'RECEIVED' || existing.status === 'PROCESSING')
    ) {
        const newLease = now + leaseTtlMs
        const updateRes = await db
            .prepare(
                `UPDATE idempotency_keys
             SET status = 'PROCESSING',
                 handler_lease_expires_at = ?,
                 updated_at = ?
             WHERE key = ? AND handler_lease_expires_at = ?`,
            )
            .bind(newLease, now, key, existing.handler_lease_expires_at)
            .run()

        if (updateRes?.meta?.changes === 1) {
            console.log(
                `>> [IDEMPOTENCY:RECLAIM] Reclaimed expired lease for key '${key}' [OK]`,
            )
            return {
                isUnique: true,
                isReclaimed: true,
                status: 'PROCESSING',
            }
        }
    }

    // In-flight or unexpired duplicate
    return {
        isUnique: false,
        isReclaimed: false,
        status: existing.status,
    }
}

/**
 * Transitions an idempotency key to PROCESSING and extends its lease.
 */
export async function markIdempotencyProcessing(
    db: any,
    key: string,
    leaseTtlMs = 60_000,
): Promise<void> {
    const now = Date.now()
    const expiresAt = now + leaseTtlMs
    await db
        .prepare(
            `UPDATE idempotency_keys
         SET status = 'PROCESSING',
             handler_lease_expires_at = ?,
             updated_at = ?
         WHERE key = ?`,
        )
        .bind(expiresAt, now, key)
        .run()
}

/**
 * Transitions an idempotency key to COMPLETED and records the cached response payload.
 */
export async function markIdempotencyCompleted(
    db: any,
    key: string,
    responsePayload?: any,
): Promise<void> {
    const now = Date.now()
    const serializedPayload =
        responsePayload !== undefined ? JSON.stringify(responsePayload) : null
    await db
        .prepare(
            `UPDATE idempotency_keys
         SET status = 'COMPLETED',
             response_payload = ?,
             updated_at = ?
         WHERE key = ?`,
        )
        .bind(serializedPayload, now, key)
        .run()
}

/**
 * Transitions an idempotency key to FAILED and records the error diagnostic.
 */
export async function markIdempotencyFailed(
    db: any,
    key: string,
    errorPayload?: any,
): Promise<void> {
    const now = Date.now()
    const serializedError =
        errorPayload !== undefined ? JSON.stringify(errorPayload) : null
    await db
        .prepare(
            `UPDATE idempotency_keys
         SET status = 'FAILED',
             response_payload = ?,
             updated_at = ?
         WHERE key = ?`,
        )
        .bind(serializedError, now, key)
        .run()
}
