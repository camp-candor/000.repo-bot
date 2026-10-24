import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
    createGetCommitShaTool,
    createEphemeralBranchTool,
    createWriteRepoFileTool,
    createPullRequestTool,
    createInspectRepoChecksTool,
    GetCommitShaParams,
    CreateEphemeralBranchParams,
    WriteRepoFileParams,
    CreatePullRequestParams,
    InspectRepoChecksParams,
    coreTools,
    type Env,
} from '../../src/tools.core.js'
import { customTools } from '../../src/tools.custom.js'

describe('Deterministic Git Tools & TypeBox Firewall (apps/worker)', () => {
    const mockEnv = {
        CLOUDFLARE_ACCOUNT_ID: 'mock_acc',
        CLOUDFLARE_API_TOKEN: 'mock_cf_token',
        CLOUDFLARE_AI_GATEWAY: 'test-gateway',
        GITHUB_TOKEN: 'ghp_mock_token_123',
        AI: {},
        AGENT_SESSION: {} as any,
    } as Env

    const parseReceipt = (result: any) => {
        const item = result.content[0]
        if (item.type === 'text') {
            return JSON.parse(item.text)
        }
        throw new Error('Expected text content')
    }

    const originalFetch = globalThis.fetch

    beforeEach(() => {
        vi.restoreAllMocks()
    })

    afterEach(() => {
        globalThis.fetch = originalFetch
    })

    describe('Segregated Tool Registry Composition', () => {
        it('exports exactly 5 core tools from coreTools(env)', () => {
            const tools = coreTools(mockEnv)
            expect(tools).toHaveLength(5)
            const names = tools.map((t) => t.name)
            expect(names).toEqual([
                'get_commit_sha',
                'create_ephemeral_branch',
                'write_repo_file',
                'create_pull_request',
                'inspect_repo_checks',
            ])
        })

        it('exports empty array from customTools(env) by default in upstream', () => {
            const custom = customTools(mockEnv)
            expect(Array.isArray(custom)).toBe(true)
            expect(custom).toHaveLength(0)
        })
    })

    describe('TypeBox Structural Firewall Invariants', () => {
        it('enforces additionalProperties: false across all parameter schemas', () => {
            expect(GetCommitShaParams.additionalProperties).toBe(false)
            expect(CreateEphemeralBranchParams.additionalProperties).toBe(false)
            expect(WriteRepoFileParams.additionalProperties).toBe(false)
            expect(CreatePullRequestParams.additionalProperties).toBe(false)
            expect(InspectRepoChecksParams.additionalProperties).toBe(false)
        })
    })

    describe('get_commit_sha', () => {
        it('captures S_clean commit SHA from target branch', async () => {
            globalThis.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({
                    object: { sha: 'a1b2c3d4e5f67890123456789012345678901234' },
                }),
            } as any)

            const tool = createGetCommitShaTool(mockEnv)
            const result = await tool.execute('call_1', {
                owner: 'camp-candor',
                repo: '000.repo-bot',
                branch: 'main',
            })

            const receipt = parseReceipt(result)
            expect(receipt.action).toBe('COMMIT_SHA_CAPTURED')
            expect(receipt.s_clean).toBe(
                'a1b2c3d4e5f67890123456789012345678901234',
            )
            expect(result.details.sha).toBe(
                'a1b2c3d4e5f67890123456789012345678901234',
            )
        })

        it('handles upstream 404 cleanly with status FAILED', async () => {
            globalThis.fetch = vi.fn().mockResolvedValue({
                ok: false,
                status: 404,
                json: async () => ({ message: 'Not Found' }),
            } as any)

            const tool = createGetCommitShaTool(mockEnv)
            const result = await tool.execute('call_1', {
                owner: 'camp-candor',
                repo: '000.repo-bot',
                branch: 'main',
            })

            const receipt = parseReceipt(result)
            expect(receipt.status).toBe('FAILED')
            expect(receipt.error).toContain('404')
        })
    })

    describe('create_ephemeral_branch', () => {
        it('anchors ephemeral branch strictly to base_sha', async () => {
            globalThis.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({
                    ref: 'refs/heads/spec/TASK-01-abc1234',
                }),
            } as any)

            const tool = createEphemeralBranchTool(mockEnv)
            const result = await tool.execute('call_1', {
                owner: 'camp-candor',
                repo: '000.repo-bot',
                branch_name: 'spec/TASK-01-abc1234',
                base_sha: 'a1b2c3d4e5f67890123456789012345678901234',
            })

            const receipt = parseReceipt(result)
            expect(receipt.action).toBe('EPHEMERAL_BRANCH_CREATED')
            expect(receipt.ref).toBe('refs/heads/spec/TASK-01-abc1234')
            expect(receipt.anchored_sha).toBe(
                'a1b2c3d4e5f67890123456789012345678901234',
            )
        })

        it('rejects attempt to provision a protected root branch', async () => {
            const tool = createEphemeralBranchTool(mockEnv)
            const result = await tool.execute('call_err', {
                owner: 'camp-candor',
                repo: '000.repo-bot',
                branch_name: 'refs/heads/main' as any,
                base_sha: 'a1b2c3d4e5f67890123456789012345678901234',
            })

            const receipt = parseReceipt(result)
            expect(receipt.status).toBe('FAILED')
            expect(receipt.error).toContain('SECURITY_BREACH')
        })
    })

    describe('write_repo_file & Traversal Firewall', () => {
        it('encodes content to Base64 and commits to ephemeral branch', async () => {
            globalThis.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({
                    commit: { sha: 'commit_sha_999' },
                }),
            } as any)

            const tool = createWriteRepoFileTool(mockEnv)
            const rawContent = 'Deterministic Content: UTF-8 Line 1\nLine 2'
            const expectedBase64 = btoa(
                unescape(encodeURIComponent(rawContent)),
            )

            const result = await tool.execute('call_1', {
                owner: 'camp-candor',
                repo: '000.repo-bot',
                path: 'docs/specs/TASK-01.md',
                content: rawContent,
                commit_message: 'chore(spec): write task 01',
                branch: 'spec/TASK-01-abc1234',
            })

            expect(globalThis.fetch).toHaveBeenCalledWith(
                'https://api.github.com/repos/camp-candor/000.repo-bot/contents/docs/specs/TASK-01.md',
                expect.objectContaining({
                    method: 'PUT',
                    body: JSON.stringify({
                        message: 'chore(spec): write task 01',
                        content: expectedBase64,
                        branch: 'spec/TASK-01-abc1234',
                    }),
                }),
            )

            const receipt = parseReceipt(result)
            expect(receipt.action).toBe('FILE_COMMITTED')
            expect(receipt.commit_sha).toBe('commit_sha_999')
            expect(receipt.path).toBe('docs/specs/TASK-01.md')
        })

        it('rejects directory traversal attempts with SECURITY_BREACH', async () => {
            const tool = createWriteRepoFileTool(mockEnv)
            const result = await tool.execute('call_trav', {
                owner: 'camp-candor',
                repo: '000.repo-bot',
                path: '../../.github/workflows/deploy.yml',
                content: 'malicious',
                commit_message: 'exploit',
                branch: 'spec/TASK-01-abc1234',
            })

            const receipt = parseReceipt(result)
            expect(receipt.status).toBe('FAILED')
            expect(receipt.error).toContain('SECURITY_BREACH')
            expect(receipt.error).toContain('Directory traversal')
        })

        it('rejects direct commits to protected trunk branch', async () => {
            const tool = createWriteRepoFileTool(mockEnv)
            const result = await tool.execute('call_prot', {
                owner: 'camp-candor',
                repo: '000.repo-bot',
                path: 'src/index.ts',
                content: 'unvetted',
                commit_message: 'direct commit',
                branch: 'main' as any,
            })

            const receipt = parseReceipt(result)
            expect(receipt.status).toBe('FAILED')
            expect(receipt.error).toContain('SECURITY_BREACH')
            expect(receipt.error).toContain(
                'Refusal to operate on non-spec branch',
            )
        })
    })

    describe('create_pull_request', () => {
        it('opens pull request from ephemeral branch to trunk', async () => {
            globalThis.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({
                    number: 101,
                    html_url:
                        'https://github.com/camp-candor/000.repo-bot/pull/101',
                }),
            } as any)

            const tool = createPullRequestTool(mockEnv)
            const result = await tool.execute('call_pr', {
                owner: 'camp-candor',
                repo: '000.repo-bot',
                title: 'spec(TASK-01): candidate specification',
                body: 'Task specification body',
                head_branch: 'spec/TASK-01-abc1234',
                base_branch: 'main',
            })

            const receipt = parseReceipt(result)
            expect(receipt.action).toBe('PULL_REQUEST_OPENED')
            expect(receipt.pr_number).toBe(101)
            expect(receipt.html_url).toBe(
                'https://github.com/camp-candor/000.repo-bot/pull/101',
            )
        })
    })

    describe('inspect_repo_checks', () => {
        it('evaluates check-runs and computes all_passed accurately', async () => {
            const mockCommit = {
                sha: 'commit_hash_123',
                commit: {
                    message: 'feat: add tools',
                    author: { name: 'Auditor', date: '2026-10-06T08:00:00Z' },
                },
            }
            const mockCheckRuns = {
                total_count: 1,
                check_runs: [
                    {
                        name: 'ci/test',
                        status: 'completed',
                        conclusion: 'success',
                        details_url: 'https://ci/1',
                    },
                ],
            }

            globalThis.fetch = vi.fn().mockImplementation((url: string) => {
                if (url.includes('/commits?per_page=1')) {
                    return Promise.resolve({
                        ok: true,
                        json: async () => [mockCommit],
                    })
                }
                if (url.includes('/check-runs')) {
                    return Promise.resolve({
                        ok: true,
                        json: async () => mockCheckRuns,
                    })
                }
                return Promise.reject(new Error(`Unexpected url: ${url}`))
            })

            const tool = createInspectRepoChecksTool(mockEnv)
            const result = await tool.execute('call_checks', {
                owner: 'camp-candor',
                repo: '000.repo-bot',
            })

            expect(result.details.checks.all_passed).toBe(true)
            expect(result.details.checks.status).toBe('completed')
            expect(result.details.commit.sha).toBe('commit_hash_123')
        })
    })
})
