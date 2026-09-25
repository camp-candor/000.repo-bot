import { describe, it, expect, vi } from 'vitest'
import { appendAuditEvent } from '../../src/audit/auditLedger.js'
import { computeGenesisHash } from '../../src/audit/hashChain.js'

describe('Audit Ledger & Hash Chaining Suite', () => {
    it('appends events with unbroken recursive SHA-256 chain', async () => {
        const mockRows: any[] = []
        const mockDb = {
            prepare: vi.fn().mockReturnValue({
                first: vi.fn().mockImplementation(async () => {
                    if (mockRows.length === 0) return null
                    return mockRows[mockRows.length - 1]
                }),
                bind: vi.fn().mockImplementation((...args: any[]) => ({
                    first: vi.fn().mockImplementation(async () => {
                        if (mockRows.length === 0) return null
                        return mockRows[mockRows.length - 1]
                    }),
                    run: vi.fn().mockImplementation(async () => {
                        mockRows.push({
                            sequence_id: args[0],
                            record_hash: args[8],
                            prev_hash: args[7],
                        })
                        return { meta: { changes: 1 } }
                    }),
                })),
            }),
        }

        const event1 = await appendAuditEvent(mockDb, {
            taskId: 'TASK-01',
            repository: 'astro-kahn-it-com/001.goblin-lore',
            eventType: 'WEBHOOK_RECEIVED',
            actorId: 'elliotbradly',
            headSha: 'dab76e8',
            payload: { action: 'opened' },
        })

        const expectedH0 = await computeGenesisHash(
            'astro-kahn-it-com/001.goblin-lore',
        )
        expect(event1.prev_hash).toBe(expectedH0)
        expect(event1.record_hash).toHaveLength(64)

        const event2 = await appendAuditEvent(mockDb, {
            taskId: 'TASK-01',
            repository: 'astro-kahn-it-com/001.goblin-lore',
            eventType: 'CAS_MERGE',
            actorId: 'elliotbradly',
            headSha: 'dab76e8',
            payload: { action: 'merged' },
        })

        expect(event2.prev_hash).toBe(event1.record_hash)
        expect(event2.record_hash).not.toBe(event1.record_hash)
    })
})
