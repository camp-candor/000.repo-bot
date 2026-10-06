import { describe, it, expect, beforeEach } from 'vitest'
import {
    evaluateTransportIdempotency,
    markIdempotencyProcessing,
    markIdempotencyCompleted,
    type IdempotencyRecord,
} from '../../src/ledger/idempotency.js'
import { purgeExpiredIdempotencyKeys } from '../../src/crons/sweeper.js'

class MockPreparedStatement {
    constructor(
        private sql: string,
        private params: any[] = [],
        private mockDb: MockD1Database,
    ) {}

    bind(...params: any[]) {
        return new MockPreparedStatement(this.sql, params, this.mockDb)
    }

    async first<T = any>(): Promise<T | null> {
        const rows = await this.mockDb._query(this.sql, this.params)
        return (rows[0] as T) || null
    }

    async run() {
        return this.mockDb._execute(this.sql, this.params)
    }
}

class MockD1Database {
    store: Map<string, IdempotencyRecord> = new Map()
    shouldThrow = false

    async exec(_sql: string) {
        if (this.shouldThrow) throw new Error('SIMULATED_D1_EXEC_FAILURE')
        return { success: true }
    }

    prepare(sql: string) {
        return new MockPreparedStatement(sql, [], this)
    }

    async _execute(sql: string, params: any[]) {
        if (this.shouldThrow) {
            throw new Error('SIMULATED_D1_QUERY_FAILURE')
        }
        const trimmed = sql.replace(/\s+/g, ' ').trim()

        if (trimmed.startsWith('INSERT INTO idempotency_keys')) {
            const [key, scope, leaseExpiresAt, now1, now2] = params
            if (this.store.has(key)) {
                return { meta: { changes: 0 } }
            }
            this.store.set(key, {
                key,
                scope,
                status: 'RECEIVED',
                handler_lease_expires_at: leaseExpiresAt,
                response_payload: null,
                created_at: now1,
                updated_at: now2,
            })
            return { meta: { changes: 1 } }
        }

        if (
            trimmed.startsWith('UPDATE idempotency_keys') &&
            trimmed.includes('WHERE key = ? AND handler_lease_expires_at = ?')
        ) {
            const [newLease, now, key, expectedLease] = params
            const rec = this.store.get(key)
            if (rec && rec.handler_lease_expires_at === expectedLease) {
                rec.status = 'PROCESSING'
                rec.handler_lease_expires_at = newLease
                rec.updated_at = now
                return { meta: { changes: 1 } }
            }
            return { meta: { changes: 0 } }
        }

        if (
            trimmed.startsWith('UPDATE idempotency_keys') &&
            trimmed.includes("SET status = 'PROCESSING'")
        ) {
            const [expiresAt, now, key] = params
            const rec = this.store.get(key)
            if (rec) {
                rec.status = 'PROCESSING'
                rec.handler_lease_expires_at = expiresAt
                rec.updated_at = now
                return { meta: { changes: 1 } }
            }
            return { meta: { changes: 0 } }
        }

        if (
            trimmed.startsWith('UPDATE idempotency_keys') &&
            trimmed.includes("SET status = 'COMPLETED'")
        ) {
            const [payload, now, key] = params
            const rec = this.store.get(key)
            if (rec) {
                rec.status = 'COMPLETED'
                rec.response_payload = payload
                rec.updated_at = now
                return { meta: { changes: 1 } }
            }
            return { meta: { changes: 0 } }
        }

        if (
            trimmed.startsWith('UPDATE idempotency_keys') &&
            trimmed.includes("SET status = 'FAILED'")
        ) {
            const [payload, now, key] = params
            const rec = this.store.get(key)
            if (rec) {
                rec.status = 'FAILED'
                rec.response_payload = payload
                rec.updated_at = now
                return { meta: { changes: 1 } }
            }
            return { meta: { changes: 0 } }
        }

        if (
            trimmed.startsWith(
                'DELETE FROM idempotency_keys WHERE created_at < ?',
            )
        ) {
            const [cutoff] = params
            let changes = 0
            for (const [k, v] of Array.from(this.store.entries())) {
                if (v.created_at < cutoff) {
                    this.store.delete(k)
                    changes++
                }
            }
            return { meta: { changes } }
        }

        return { meta: { changes: 0 } }
    }

    async _query(sql: string, params: any[]) {
        if (this.shouldThrow) {
            throw new Error('SIMULATED_D1_QUERY_FAILURE')
        }
        const trimmed = sql.replace(/\s+/g, ' ').trim()
        if (
            trimmed.startsWith('SELECT') &&
            trimmed.includes('FROM idempotency_keys WHERE key = ?')
        ) {
            const key = params[0]
            const match = this.store.get(key)
            return match ? [match] : []
        }
        return []
    }
}

describe('Transport Idempotency & Deduplication Engine (Phase 2)', () => {
    let mockDb: MockD1Database

    beforeEach(() => {
        mockDb = new MockD1Database()
    })

    it('TASK-2.1: registers first-time unique delivery and marks it RECEIVED', async () => {
        const evalRes = await evaluateTransportIdempotency(mockDb, {
            key: 'delivery-uuid-001',
            scope: 'github-webhook',
        })

        expect(evalRes.isUnique).toBe(true)
        expect(evalRes.isReclaimed).toBe(false)
        expect(evalRes.status).toBe('RECEIVED')

        const stored = mockDb.store.get('delivery-uuid-001')
        expect(stored).toBeDefined()
        expect(stored?.status).toBe('RECEIVED')
    })

    it('TASK-2.1 & 2.2: returns cached response payload when duplicate delivery is already COMPLETED', async () => {
        const key = 'delivery-uuid-002'
        await evaluateTransportIdempotency(mockDb, {
            key,
            scope: 'github-webhook',
        })
        await markIdempotencyCompleted(mockDb, key, {
            action: 'PROCESSED_PR',
            prNumber: 42,
        })

        const dupRes = await evaluateTransportIdempotency(mockDb, {
            key,
            scope: 'github-webhook',
        })
        expect(dupRes.isUnique).toBe(false)
        expect(dupRes.status).toBe('COMPLETED')
        expect(dupRes.cachedResponse).toEqual({
            action: 'PROCESSED_PR',
            prNumber: 42,
        })
    })

    it('TASK-2.2: rejects in-flight duplicate delivery while lease is active', async () => {
        const key = 'delivery-uuid-003'
        await evaluateTransportIdempotency(mockDb, {
            key,
            scope: 'github-webhook',
            leaseTtlMs: 60_000,
        })
        await markIdempotencyProcessing(mockDb, key, 60_000)

        const dupRes = await evaluateTransportIdempotency(mockDb, {
            key,
            scope: 'github-webhook',
        })
        expect(dupRes.isUnique).toBe(false)
        expect(dupRes.isReclaimed).toBe(false)
        expect(dupRes.status).toBe('PROCESSING')
    })

    it('TASK-2.2: safely reclaims stalled delivery when handler lease has expired', async () => {
        const key = 'delivery-uuid-004'
        // Create an expired record simulating an isolate crash
        mockDb.store.set(key, {
            key,
            scope: 'github-webhook',
            status: 'PROCESSING',
            handler_lease_expires_at: Date.now() - 5_000, // Expired 5 seconds ago
            response_payload: null,
            created_at: Date.now() - 65_000,
            updated_at: Date.now() - 65_000,
        })

        const reclaimRes = await evaluateTransportIdempotency(mockDb, {
            key,
            scope: 'github-webhook',
            leaseTtlMs: 30_000,
        })

        expect(reclaimRes.isUnique).toBe(true)
        expect(reclaimRes.isReclaimed).toBe(true)
        expect(reclaimRes.status).toBe('PROCESSING')

        const updated = mockDb.store.get(key)
        expect(updated?.handler_lease_expires_at).toBeGreaterThan(Date.now())
    })

    it('TASK-2.1: ensures database errors throw instead of falsely reporting duplicate status', async () => {
        mockDb.shouldThrow = true

        await expect(
            evaluateTransportIdempotency(mockDb, {
                key: 'delivery-uuid-005',
                scope: 'github-webhook',
            }),
        ).rejects.toThrow('SIMULATED_D1_EXEC_FAILURE')
    })

    it('TASK-2.3: purges records older than 7 days while retaining younger keys', async () => {
        const now = Date.now()
        const eightDaysAgo = now - 8 * 86_400_000
        const oneDayAgo = now - 1 * 86_400_000

        mockDb.store.set('old-key-1', {
            key: 'old-key-1',
            scope: 'test',
            status: 'COMPLETED',
            handler_lease_expires_at: eightDaysAgo,
            response_payload: null,
            created_at: eightDaysAgo,
            updated_at: eightDaysAgo,
        })

        mockDb.store.set('recent-key-1', {
            key: 'recent-key-1',
            scope: 'test',
            status: 'COMPLETED',
            handler_lease_expires_at: oneDayAgo,
            response_payload: null,
            created_at: oneDayAgo,
            updated_at: oneDayAgo,
        })

        const purgeResult = await purgeExpiredIdempotencyKeys(mockDb)
        expect(purgeResult.purgedCount).toBe(1)
        expect(mockDb.store.has('old-key-1')).toBe(false)
        expect(mockDb.store.has('recent-key-1')).toBe(true)
    })
})
