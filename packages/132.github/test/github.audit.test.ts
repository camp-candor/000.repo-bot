import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
    auditHashChainIntegrity,
    inspectD1AuditLog,
    triggerColdDrainage,
} from '../00.github.unit/buz/github.buzz.js'
import { GithubModel } from '../00.github.unit/github.model.js'

describe('GitHub Terminal Deck: Hash Chain Verification & D1 Audit Suites', () => {
    beforeEach(() => {
        vi.restoreAllMocks()
        ;(global as any).LIBRARY = { hunt: vi.fn().mockResolvedValue({}) }
    })

    it('auditHashChainIntegrity validates unbroken sequential SHA-256 chain', async () => {
        const model = new GithubModel()
        const slv = vi.fn()

        const mockRows = [
            {
                sequence_id: 1,
                prev_hash: 'GENESIS_001',
                record_hash: 'HASH_001',
            },
            {
                sequence_id: 2,
                prev_hash: 'HASH_001',
                record_hash: 'HASH_002',
            },
            {
                sequence_id: 3,
                prev_hash: 'HASH_002',
                record_hash: 'HASH_003',
            },
        ]

        global.fetch = vi.fn().mockResolvedValue(
            new Response(
                JSON.stringify({
                    ok: true,
                    count: 3,
                    rows: mockRows,
                }),
                { status: 200 },
            ),
        ) as any

        await auditHashChainIntegrity(
            model,
            {
                idx: 'audit-chain',
                src: 'astro-kahn-it-com/001.goblin-lore',
                slv,
            },
            {} as any,
        )

        expect(slv).toHaveBeenCalled()
        const result = slv.mock.calls[0][0]
        expect(result.gthBit.val).toBe(1)
        expect(result.gthBit.idx).toBe('audit-chain')
    })

    it('auditHashChainIntegrity flags tamper when prev_hash diverges', async () => {
        const model = new GithubModel()
        const slv = vi.fn()

        const corruptedRows = [
            {
                sequence_id: 1,
                prev_hash: 'GENESIS_001',
                record_hash: 'HASH_001',
            },
            {
                sequence_id: 2,
                prev_hash: 'TAMPERED_PREV_HASH',
                record_hash: 'HASH_002',
            },
        ]

        global.fetch = vi.fn().mockResolvedValue(
            new Response(
                JSON.stringify({
                    ok: true,
                    count: 2,
                    rows: corruptedRows,
                }),
                { status: 200 },
            ),
        ) as any

        await auditHashChainIntegrity(
            model,
            {
                idx: 'audit-chain',
                src: 'astro-kahn-it-com/001.goblin-lore',
                slv,
            },
            {} as any,
        )

        expect(slv).toHaveBeenCalled()
        const result = slv.mock.calls[0][0]
        expect(result.gthBit.val).toBe(0)
    })

    it('inspectD1AuditLog queries recent fleet event stream from D1', async () => {
        const model = new GithubModel()
        const slv = vi.fn()

        const mockEvents = [
            {
                sequence_id: 10,
                created_at: 1727200000000,
                event_type: 'PR_MERGED',
                repository: 'camp-candor/000.repo-bot',
                task_id: 'TASK-10',
                actor_id: 'elliotbradly',
                head_sha: 'a1b2c3d4e5f6',
                record_hash: 'h1a2s3h4',
                drained_at: null,
            },
        ]

        global.fetch = vi.fn().mockResolvedValue(
            new Response(
                JSON.stringify({
                    ok: true,
                    events: mockEvents,
                }),
                { status: 200 },
            ),
        ) as any

        await inspectD1AuditLog(model, { idx: 'inspect-d1', slv }, {} as any)

        expect(slv).toHaveBeenCalled()
        const result = slv.mock.calls[0][0]
        expect(result.gthBit.val).toBe(1)
        expect(result.gthBit.idx).toBe('inspect-d1')
    })

    it('triggerColdDrainage invokes edge drainage flush and reports telemetry', async () => {
        const model = new GithubModel()
        const slv = vi.fn()

        const mockDrainResult = {
            ok: true,
            drainedCount: 42,
            committedFiles: ['audit/2026/09/24/repo.ndjson'],
            prunedCount: 15,
        }

        global.fetch = vi
            .fn()
            .mockResolvedValue(
                new Response(JSON.stringify(mockDrainResult), { status: 200 }),
            ) as any

        await triggerColdDrainage(
            model,
            { idx: 'trigger-drainage', slv },
            {} as any,
        )

        expect(slv).toHaveBeenCalled()
        const result = slv.mock.calls[0][0]
        expect(result.gthBit.val).toBe(1)
        expect(result.gthBit.idx).toBe('trigger-drainage')
    })
})
