import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
    formatNdjsonBatch,
    executeColdDrainage,
} from '../../src/audit/drainageEngine.js'
import { StoredAuditEvent } from '../../src/audit/auditLedger.js'

describe('Cold Plaintext Drainage Engine Suite', () => {
    beforeEach(() => {
        vi.restoreAllMocks()
    })

    const sampleRecords: StoredAuditEvent[] = [
        {
            sequence_id: 1,
            task_id: 'TASK-01',
            repository: 'camp-candor/000.repo-bot',
            event_type: 'WEBHOOK_RECEIVED',
            actor_id: 'elliotbradly',
            head_sha: 'dab76e8',
            payload_json: JSON.stringify({ action: 'opened' }),
            prev_hash: 'GENESIS_HASH_001',
            record_hash: 'HASH_001',
            created_at: 1727200000000,
            drained_at: null,
        },
        {
            sequence_id: 2,
            task_id: 'TASK-01',
            repository: 'camp-candor/000.repo-bot',
            event_type: 'CAS_MERGE',
            actor_id: 'elliotbradly',
            head_sha: 'dab76e8',
            payload_json: JSON.stringify({ action: 'merged' }),
            prev_hash: 'HASH_001',
            record_hash: 'HASH_002',
            created_at: 1727200005000,
            drained_at: null,
        },
    ]

    it('formatNdjsonBatch serializes audit records to newline-delimited JSON', () => {
        const ndjson = formatNdjsonBatch(sampleRecords)
        const lines = ndjson.trim().split('\n')
        expect(lines).toHaveLength(2)

        const parsedFirst = JSON.parse(lines[0])
        expect(parsedFirst.seq).toBe(1)
        expect(parsedFirst.repo).toBe('camp-candor/000.repo-bot')
        expect(parsedFirst.type).toBe('WEBHOOK_RECEIVED')
        expect(parsedFirst.hash).toBe('HASH_001')
        expect(parsedFirst.payload.action).toBe('opened')
    })

    it('executeColdDrainage aborts if GITHUB_TOKEN is missing', async () => {
        const mockDb = { prepare: vi.fn() }
        await expect(
            executeColdDrainage(mockDb, { GITHUB_TOKEN: '' }),
        ).rejects.toThrow('GITHUB_TOKEN missing')
    })

    it('executeColdDrainage returns zeroes when no undrained records exist', async () => {
        const mockDb = {
            prepare: vi.fn().mockReturnValue({
                all: vi.fn().mockResolvedValue({ results: [] }),
            }),
        }

        const result = await executeColdDrainage(mockDb, {
            GITHUB_TOKEN: 'mock-token',
        })
        expect(result.drainedCount).toBe(0)
        expect(result.committedFiles).toHaveLength(0)
        expect(result.prunedCount).toBe(0)
    })

    it('executeColdDrainage groups batches, commits to GitHub audit-log branch, updates drained_at, and prunes old rows', async () => {
        let updateExecuted = false
        let deleteExecuted = false

        const mockDb = {
            prepare: vi.fn().mockImplementation((query: string) => ({
                all: vi.fn().mockImplementation(async () => {
                    if (query.includes('WHERE drained_at IS NULL')) {
                        return { results: sampleRecords }
                    }
                    return { results: [] }
                }),
                bind: vi.fn().mockImplementation(() => ({
                    run: vi.fn().mockImplementation(async () => {
                        if (query.includes('UPDATE audit_events')) {
                            updateExecuted = true
                        }
                        if (query.includes('DELETE FROM audit_events')) {
                            deleteExecuted = true
                        }
                        return { meta: { changes: 1 } }
                    }),
                })),
            })),
        }

        let putBranch = ''
        let putMessage = ''
        global.fetch = vi
            .fn()
            .mockImplementation(async (url: string, opts: any) => {
                if (opts?.method === 'PUT') {
                    const body = JSON.parse(opts.body)
                    putBranch = body.branch
                    putMessage = body.message
                    return new Response(
                        JSON.stringify({ content: { sha: 'new-sha' } }),
                        {
                            status: 200,
                        },
                    )
                }
                // GET check for existing SHA
                return new Response('{}', { status: 404 })
            }) as any

        const result = await executeColdDrainage(mockDb, {
            GITHUB_TOKEN: 'mock-gh-token',
            ARCHIVE_REPO: 'camp-candor/000.repo-bot',
        })

        expect(result.drainedCount).toBe(2)
        expect(result.committedFiles).toHaveLength(1)
        expect(result.committedFiles[0]).toMatch(
            /^audit\/\d{4}\/\d{2}\/\d{2}\/camp-candor_000_repo-bot\.ndjson$/,
        )
        expect(putBranch).toBe('audit-log')
        expect(putMessage).toContain('drain events 1 -> 2')
        expect(updateExecuted).toBe(true)
        expect(deleteExecuted).toBe(true)
    })
})
