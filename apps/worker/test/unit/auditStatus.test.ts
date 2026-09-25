import { describe, it, expect, vi } from 'vitest'
import app from '../../src/index.js'

describe('Worker Ingress: Audit Status & Self-Healing D1 Telemetry', () => {
    it('executes ensureAuditSchema and returns status telemetry on GET /api/audit/status', async () => {
        const mockExec = vi.fn().mockResolvedValue(undefined)
        const mockPrepare = vi.fn().mockImplementation((query: string) => ({
            bind: vi.fn().mockReturnThis(),
            first: vi.fn().mockImplementation(async () => {
                if (query.includes('MAX(drained_at)'))
                    return { lastDrainedAt: 1727200000000 }
                if (query.includes('drained_at IS NULL')) return { count: 12 }
                if (query.includes('COUNT(*) as count FROM audit_events'))
                    return { count: 85 }
                if (query.includes('ORDER BY sequence_id DESC LIMIT 1')) {
                    return {
                        sequence_id: 85,
                        created_at: 1727200050000,
                        repository: 'astro-kahn-it-com/001.goblin-lore',
                        event_type: 'CAS_MERGE',
                        record_hash:
                            'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
                    }
                }
                return null
            }),
            all: vi.fn().mockResolvedValue({ results: [] }),
        }))

        const mockEnv = {
            DB: {
                exec: mockExec,
                prepare: mockPrepare,
            },
        }

        const req = new Request('http://localhost/api/audit/status', {
            method: 'GET',
        })
        const res = await app.fetch(req, mockEnv as any)

        expect(res.status).toBe(200)
        const body: any = await res.json()
        expect(body.ok).toBe(true)
        expect(body.undrainedCount).toBe(12)
        expect(body.totalHotRecords).toBe(85)
        expect(body.lastRecord.sequence_id).toBe(85)
        expect(body.cronSchedule).toContain('Midnight UTC')
    })
})
