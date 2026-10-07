import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GitCommitClient } from '../../src/drainage/gitCommitClient.js'
import {
    ColdLedgerDrainEngine,
    DEFAULT_RETENTION_THRESHOLD_MS,
} from '../../src/drainage/coldLedgerDrain.js'
import type {
    D1DatabaseInterface,
    D1PreparedStatementInterface,
} from '../../src/db/d1Ledger.js'
import { ShotCoordinatorDO } from '../../src/objects/ShotCoordinatorDO.js'

class MockD1Database implements D1DatabaseInterface {
    public taskLedger = new Map<string, any>()
    public taskTransitions: any[] = []

    async exec(): Promise<any> {
        return { success: true }
    }

    prepare(query: string): D1PreparedStatementInterface {
        const self = this
        let boundValues: any[] = []

        const stmt: D1PreparedStatementInterface = {
            bind(...values: any[]) {
                boundValues = values
                return stmt
            },
            async run() {
                if (
                    query.includes(
                        'DELETE FROM task_transitions WHERE task_id = ?',
                    )
                ) {
                    const [taskId] = boundValues
                    self.taskTransitions = self.taskTransitions.filter(
                        (t) => t.task_id !== taskId,
                    )
                } else if (query.includes('COLD_ARCHIVED')) {
                    const [canonicalKey, updatedAtMs, taskId] = boundValues
                    const task = self.taskLedger.get(taskId)
                    if (task) {
                        task.status = 'COLD_ARCHIVED'
                        task.canonical_key = canonicalKey
                        task.updated_at_ms = updatedAtMs
                    }
                }
                return { success: true }
            },
            async all<T = any>() {
                if (query.includes('FROM task_ledger')) {
                    const [cutoffTime, limit] = boundValues
                    const eligible = Array.from(self.taskLedger.values())
                        .filter(
                            (t) =>
                                [
                                    'VERIFYING',
                                    'PROMOTED',
                                    'DLQ',
                                    'ABORTED',
                                ].includes(t.status) &&
                                t.updated_at_ms <= cutoffTime,
                        )
                        .slice(0, limit)
                    return { results: eligible as T[], success: true }
                } else if (query.includes('FROM task_transitions')) {
                    const [taskId] = boundValues
                    const transitions = self.taskTransitions.filter(
                        (t) => t.task_id === taskId,
                    )
                    return { results: transitions as T[], success: true }
                }
                return { results: [], success: true }
            },
            async first<T = any>() {
                if (query.includes('SUM(')) {
                    let finalized = 0
                    let archived = 0
                    for (const t of self.taskLedger.values()) {
                        if (
                            [
                                'VERIFYING',
                                'PROMOTED',
                                'DLQ',
                                'ABORTED',
                            ].includes(t.status)
                        )
                            finalized++
                        if (t.status === 'COLD_ARCHIVED') archived++
                    }
                    return {
                        finalized_pending_drain: finalized,
                        cold_archived: archived,
                        total_tasks: self.taskLedger.size,
                    } as T
                }
                return null
            },
        }
        return stmt
    }
}

class MockDurableObjectStorage {
    public store = new Map<string, any>()
    async get(key: string): Promise<any> {
        return this.store.get(key)
    }
    async put(key: string, value: any): Promise<void> {
        this.store.set(key, value)
    }
    async delete(key: string): Promise<void> {
        this.store.delete(key)
    }
}

class MockDurableObjectContext {
    public storage = new MockDurableObjectStorage()
    blockConcurrencyWhile(fn: () => Promise<any>): Promise<any> {
        return fn()
    }
}

describe('Cold Ledger Drainage (The D1-to-Git Pipeline) Battery (Phase 1)', () => {
    let mockDb: MockD1Database
    let mockGitClient: GitCommitClient
    let drainEngine: ColdLedgerDrainEngine

    beforeEach(() => {
        mockDb = new MockD1Database()

        mockGitClient = {
            getRef: vi.fn().mockResolvedValue('commit_sha_parent_001'),
            createBlob: vi.fn().mockResolvedValue('blob_sha_12345'),
            createTree: vi.fn().mockResolvedValue('tree_sha_67890'),
            createCommit: vi.fn().mockResolvedValue('commit_sha_new_cold_head'),
            updateRef: vi.fn().mockResolvedValue('commit_sha_new_cold_head'),
        } as any

        drainEngine = new ColdLedgerDrainEngine(mockDb, mockGitClient, {
            owner: 'camp-candor',
            repo: '000.repo-bot',
            branch: 'audit/cold-ledger',
            retentionThresholdMs: DEFAULT_RETENTION_THRESHOLD_MS,
        })
    })

    it('TASK-1.1: GitCommitClient communicates via blobless GitHub REST endpoints', async () => {
        const originalFetch = globalThis.fetch
        globalThis.fetch = vi
            .fn()
            .mockResolvedValue(
                new Response(JSON.stringify({ sha: 'blob_mock_sha' }), {
                    status: 201,
                }),
            ) as any

        const client = new GitCommitClient({ token: 'test_token' })
        const sha = await client.createBlob(
            'camp-candor',
            '000.repo-bot',
            '{"test":"payload"}',
        )

        expect(sha).toBe('blob_mock_sha')
        expect(globalThis.fetch).toHaveBeenCalledWith(
            'https://api.github.com/repos/camp-candor/000.repo-bot/git/blobs',
            expect.objectContaining({ method: 'POST' }),
        )

        globalThis.fetch = originalFetch
    })

    it('TASK-1.2: excludes tasks updated within the retention threshold (younger than 24h)', async () => {
        const now = 10_000_000
        // Young task (updated 1 hour ago)
        mockDb.taskLedger.set('shot-young', {
            task_id: 'shot-young',
            status: 'PROMOTED',
            updated_at_ms: now - 3_600_000,
        })

        const receipt = await drainEngine.drainToGit(now)
        expect(receipt).toBeNull()
        expect(mockGitClient.createCommit).not.toHaveBeenCalled()
    })

    it('TASK-1.2: archives eligible tasks, creates git commit, and prunes hot D1 transitions', async () => {
        const now = 100_000_000
        const oldTimestamp = now - (DEFAULT_RETENTION_THRESHOLD_MS + 10_000)

        mockDb.taskLedger.set('shot-042', {
            task_id: 'shot-042',
            status: 'PROMOTED',
            current_epoch: 2,
            artist_id: 'artist_alpha',
            workflow_template: 'wan.json',
            canonical_key: 'canonical/shot.mp4',
            sha256: 'sha42',
            attempt_count: 1,
            created_at_ms: oldTimestamp - 5000,
            updated_at_ms: oldTimestamp,
        })

        mockDb.taskTransitions.push(
            {
                id: 1,
                task_id: 'shot-042',
                from_state: 'NONE',
                to_state: 'PENDING',
                epoch: 0,
                timestamp_ms: oldTimestamp - 4000,
            },
            {
                id: 2,
                task_id: 'shot-042',
                from_state: 'PENDING',
                to_state: 'RUNNING',
                epoch: 1,
                timestamp_ms: oldTimestamp - 2000,
            },
            {
                id: 3,
                task_id: 'shot-042',
                from_state: 'RUNNING',
                to_state: 'PROMOTED',
                epoch: 2,
                timestamp_ms: oldTimestamp,
            },
        )

        const receipt = await drainEngine.drainToGit(now)

        expect(receipt).not.toBeNull()
        expect(receipt?.taskCount).toBe(1)
        expect(receipt?.commitSha).toBe('commit_sha_new_cold_head')
        expect(receipt?.prunedTransitionsCount).toBe(3)

        // Assert Git API calls
        expect(mockGitClient.createBlob).toHaveBeenCalledTimes(1)
        expect(mockGitClient.createTree).toHaveBeenCalledTimes(1)
        expect(mockGitClient.createCommit).toHaveBeenCalledTimes(1)
        expect(mockGitClient.updateRef).toHaveBeenCalledTimes(1)

        // Assert D1 cleanup
        expect(mockDb.taskTransitions).toHaveLength(0) // Pruned from D1!
        const archivedTask = mockDb.taskLedger.get('shot-042')
        expect(archivedTask.status).toBe('COLD_ARCHIVED')
        expect(archivedTask.canonical_key).toContain(
            'git:commit_sha_new_cold_head',
        )
    })

    it('TASK-1.2: aborts drainage and preserves D1 rows if Git commit fails', async () => {
        const now = 100_000_000
        const oldTimestamp = now - (DEFAULT_RETENTION_THRESHOLD_MS + 10_000)

        mockDb.taskLedger.set('shot-fail-git', {
            task_id: 'shot-fail-git',
            status: 'DLQ',
            updated_at_ms: oldTimestamp,
        })

        mockDb.taskTransitions.push({
            id: 1,
            task_id: 'shot-fail-git',
            from_state: 'RUNNING',
            to_state: 'DLQ',
            epoch: 1,
            timestamp_ms: oldTimestamp,
        })

        // Simulate GitHub API outage
        ;(mockGitClient.updateRef as any).mockRejectedValueOnce(
            new Error('GITHUB_OUTAGE_503'),
        )

        await expect(drainEngine.drainToGit(now)).rejects.toThrow(
            'GITHUB_OUTAGE_503',
        )

        // Confirm D1 state is completely untouched
        expect(mockDb.taskTransitions).toHaveLength(1)
        expect(mockDb.taskLedger.get('shot-fail-git').status).toBe('DLQ')
    })

    it('TASK-1.3: ShotCoordinatorDO triggers drainage and records block onto ledger chain', async () => {
        const mockCtx = new MockDurableObjectContext()
        const coordinator = new ShotCoordinatorDO(mockCtx as any, {
            DB: mockDb,
            GITHUB_TOKEN: 'pat_123',
            GITHUB_OWNER: 'camp-candor',
            GITHUB_REPO: '000.repo-bot',
        })

        // Mock drainage engine on DO instance
        ;(coordinator as any).drainEngine = drainEngine
        ;(coordinator as any).ledgerChain = [
            {
                blockHash: '0'.repeat(64),
                eventType: 'GENESIS',
                payload: {},
                timestampMs: Date.now(),
            },
        ]

        const now = 200_000_000
        const oldTimestamp = now - (DEFAULT_RETENTION_THRESHOLD_MS + 10_000)

        mockDb.taskLedger.set('shot-do-drain', {
            task_id: 'shot-do-drain',
            status: 'VERIFYING',
            updated_at_ms: oldTimestamp,
        })

        const res = await coordinator.fetch(
            new Request('https://do.internal/ledger/drain', {
                method: 'POST',
                body: JSON.stringify({ nowMs: now }),
            }),
        )

        expect(res.status).toBe(200)
        const data = (await res.json()) as any
        expect(data.ok).toBe(true)
        expect(data.receipt.taskCount).toBe(1)

        // Verify DO ledger chain records COLD_LEDGER_DRAINED block
        const ledgerChain = (coordinator as any).ledgerChain
        const lastBlock = ledgerChain[ledgerChain.length - 1]
        expect(lastBlock.eventType).toBe('COLD_LEDGER_DRAINED')
        expect(lastBlock.payload.commitSha).toBe('commit_sha_new_cold_head')
    })
})
