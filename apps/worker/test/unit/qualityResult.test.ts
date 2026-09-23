import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
    extractTaskIdFromBranch,
    handleCheckRunEvent,
} from '../../src/qualityResult.js'
import { RepoBotDO } from '../../src/RepoBotDO.js'

describe('FEAT-02: Quality Gauntlet Ingestion Engine', () => {
    beforeEach(() => {
        vi.restoreAllMocks()
    })

    describe('1. Branch Pattern Task Extraction', () => {
        it('extracts task ID from standard ephemeral branch format', () => {
            expect(extractTaskIdFromBranch('spec/task-04.01-c7f4901')).toBe(
                'task-04.01',
            )
            expect(extractTaskIdFromBranch('spec/TASK-12.02.01-a1b2c3d')).toBe(
                'TASK-12.02.01',
            )
            expect(extractTaskIdFromBranch('spec/task-chore-99-abcdef0')).toBe(
                'task-chore-99',
            )
        })

        it('returns null for non-tracking or malformed branches', () => {
            expect(extractTaskIdFromBranch('main')).toBeNull()
            expect(extractTaskIdFromBranch('feat/something-new')).toBeNull()
            expect(extractTaskIdFromBranch(null)).toBeNull()
            expect(extractTaskIdFromBranch(undefined)).toBeNull()
        })
    })

    describe('2. Ingestion Filtering & Preconditions', () => {
        const createMockContext = (
            headers: Record<string, string>,
            mockDoFetch: any,
            mockDb?: any,
        ) => {
            return {
                req: {
                    header: (name: string) => headers[name.toLowerCase()],
                },
                env: {
                    DB: mockDb,
                    REPO_BOT_DO: {
                        idFromName: vi.fn().mockReturnValue('mock-do-id'),
                        get: vi.fn().mockReturnValue({
                            fetch: mockDoFetch,
                        }),
                    },
                },
                json: (body: any, status = 200) => ({ body, status }),
            } as any
        }

        it('ignores check runs with unmatched names', async () => {
            const payload: any = {
                action: 'completed',
                check_run: { name: 'lint-and-typecheck', status: 'completed' },
            }
            const ctx = createMockContext({}, vi.fn())

            const res = await handleCheckRunEvent(ctx, payload)
            expect((res as any).status).toBe(200)
            expect(res.status).toBe(200)
            expect((res as any).body.status).toBe('IGNORED_CHECK_RUN')
        })

        it('waits on incomplete check runs', async () => {
            const payload: any = {
                action: 'in_progress',
                check_run: {
                    name: 'repo-bot/quality-gauntlet',
                    status: 'in_progress',
                    conclusion: null,
                },
            }
            const ctx = createMockContext({}, vi.fn())

            const res = await handleCheckRunEvent(ctx, payload)
            expect((res as any).status).toBe(200)
            expect(res.status).toBe(200)
            expect((res as any).body.status).toBe('IN_PROGRESS_WAITING')
        })

        it('forwards QUALITY_PASS when conclusion is success', async () => {
            const mockDoFetch = vi.fn().mockResolvedValue(
                new Response(
                    JSON.stringify({
                        action: 'STATE_TRANSITIONED',
                        state: 'MERGING',
                    }),
                    { status: 200 },
                ),
            )

            const payload: any = {
                action: 'completed',
                check_run: {
                    name: 'repo-bot/quality-gauntlet',
                    status: 'completed',
                    conclusion: 'success',
                    head_sha: '2222222222222222222222222222222222222222',
                    check_suite: { head_branch: 'spec/task-04.01-2222222' },
                    output: { summary: 'All 5 tiers passed' },
                },
            }
            const ctx = createMockContext(
                { 'x-github-delivery': 'del-001' },
                mockDoFetch,
            )

            const res = await handleCheckRunEvent(ctx, payload)
            expect((res as any).status).toBe(200)
            expect(res.status).toBe(200)
            expect((res as any).body.fsmEvent).toBe('QUALITY_PASS')
            expect(mockDoFetch).toHaveBeenCalledTimes(1)
        })

        it('forwards QUALITY_FAIL_RETRY when conclusion is failure', async () => {
            const mockDoFetch = vi.fn().mockResolvedValue(
                new Response(
                    JSON.stringify({
                        action: 'STATE_TRANSITIONED',
                        state: 'RETRYING',
                    }),
                    { status: 200 },
                ),
            )

            const payload: any = {
                action: 'completed',
                check_run: {
                    name: 'repo-bot/quality-gauntlet',
                    status: 'completed',
                    conclusion: 'failure',
                    head_sha: '2222222222222222222222222222222222222222',
                    check_suite: { head_branch: 'spec/task-04.01-2222222' },
                    output: { summary: 'Level 1 relational cycle breach' },
                },
            }
            const ctx = createMockContext(
                { 'x-github-delivery': 'del-002' },
                mockDoFetch,
            )

            const res = await handleCheckRunEvent(ctx, payload)
            expect((res as any).status).toBe(200)
            expect(res.status).toBe(200)
            expect((res as any).body.fsmEvent).toBe('QUALITY_FAIL_RETRY')
            expect(mockDoFetch).toHaveBeenCalledTimes(1)
        })

        it('drops duplicate deliveries when D1 changes is 0 (idempotency key deduplication)', async () => {
            const mockDb = {
                prepare: vi.fn().mockReturnValue({
                    bind: vi.fn().mockReturnValue({
                        run: vi.fn().mockResolvedValue({
                            meta: { changes: 0 },
                        }),
                    }),
                }),
            }
            const mockDoFetch = vi.fn()
            const payload: any = {
                action: 'completed',
                check_run: {
                    name: 'repo-bot/quality-gauntlet',
                    status: 'completed',
                    conclusion: 'success',
                    head_sha: '2222222222222222222222222222222222222222',
                    check_suite: { head_branch: 'spec/task-04.01-2222222' },
                    output: { summary: 'All 5 tiers passed' },
                },
            }
            const ctx = createMockContext(
                { 'x-github-delivery': 'del-001' },
                mockDoFetch,
                mockDb,
            )

            const res = await handleCheckRunEvent(ctx, payload)
            expect((res as any).status).toBe(200)
            expect((res as any).body.status).toBe('DUPLICATE_CHECK_RUN_IGNORED')
            expect((res as any).body.idempotencyKey).toBe(
                'quality:del-001:task-04.01:2222222222222222222222222222222222222222:success',
            )
            expect(mockDoFetch).not.toHaveBeenCalled()
        })
    })

    describe('3. Durable Object Stale Head SHA Guard', () => {
        it('rejects state transition with 409 STALE_SHA_REJECTED when headSha mismatches auditedHeadSha', async () => {
            const storageMap = new Map<string, any>()
            const mockCtx: any = {
                storage: {
                    get: vi.fn(async (key: string) => storageMap.get(key)),
                    put: vi.fn(async (key: string, val: any) => {
                        storageMap.set(key, val)
                    }),
                },
            }
            const doInstance: any = Object.create(RepoBotDO.prototype)
            doInstance.ctx = mockCtx
            doInstance.env = {}

            // 1. Initialize context with auditedHeadSha
            const initRes = await doInstance.fetch(
                new Request('https://internal/fsm/context', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        taskId: 'task-04.01',
                        auditedHeadSha: 'expected-head-sha-12345',
                        state: 'VERIFYING',
                    }),
                }),
            )
            expect(initRes.status).toBe(200)

            // 2. Attempt transition with stale/mismatched headSha
            const transitionRes = await doInstance.fetch(
                new Request('https://internal/fsm/transition', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        type: 'QUALITY_PASS',
                        taskId: 'task-04.01',
                        headSha: 'stale-head-sha-99999',
                    }),
                }),
            )

            expect(transitionRes.status).toBe(409)
            const body = await transitionRes.json()
            expect(body).toEqual({
                error: 'STALE_SHA_REJECTED',
                expected: 'expected-head-sha-12345',
                received: 'stale-head-sha-99999',
            })
        })
    })
})
