import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
    assertSafeBranchRef,
    PROTECTED_BRANCHES,
    createEphemeralBranchTool,
    createWriteRepoFileTool,
    createPullRequestTool,
    type Env,
} from '../../src/tools.core.js'

describe('Protected Branch Ref Shield & S_clean Invariants (apps/worker)', () => {
    const mockEnv = {
        CLOUDFLARE_ACCOUNT_ID: 'acc_test',
        CLOUDFLARE_API_TOKEN: 'cf_test_token',
        CLOUDFLARE_AI_GATEWAY: 'default',
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

    describe('assertSafeBranchRef Validator', () => {
        it('accepts valid spec/ branches', () => {
            expect(() =>
                assertSafeBranchRef('spec/TASK-01-a1b2c3d'),
            ).not.toThrow()
            expect(() =>
                assertSafeBranchRef('refs/heads/spec/TASK-02.01-1234567'),
            ).not.toThrow()
        })

        it('throws SECURITY_BREACH when ref does not begin with spec/', () => {
            expect(() => assertSafeBranchRef('feat/new-ui')).toThrow(
                /SECURITY_BREACH: Refusal to operate on non-spec branch: feat\/new-ui/,
            )
            expect(() => assertSafeBranchRef('refs/heads/patch-1')).toThrow(
                /SECURITY_BREACH: Refusal to operate on non-spec branch: patch-1/,
            )
        })

        it('throws SECURITY_BREACH for all protected root branches', () => {
            for (const branch of PROTECTED_BRANCHES) {
                expect(() => assertSafeBranchRef(branch)).toThrow(
                    /SECURITY_BREACH/,
                )
                expect(() =>
                    assertSafeBranchRef(`refs/heads/${branch}`),
                ).toThrow(/SECURITY_BREACH/)
                expect(() =>
                    assertSafeBranchRef(`spec/${branch}`),
                ).not.toThrow() // Namespaced under spec/ is permitted
            }
        })
    })

    describe('create_ephemeral_branch Guardrails', () => {
        it('rejects creation of non-spec branches', async () => {
            const tool = createEphemeralBranchTool(mockEnv)
            const result = await tool.execute('call_1', {
                owner: 'camp-candor',
                repo: '000.repo-bot',
                branch_name: 'feature-branch' as any,
                base_sha: 'a1b2c3d4e5f67890123456789012345678901234',
            })

            const receipt = parseReceipt(result)
            expect(receipt.status).toBe('FAILED')
            expect(receipt.error).toContain('SECURITY_BREACH')
        })

        it('rejects attempt to provision protected root branches', async () => {
            const tool = createEphemeralBranchTool(mockEnv)
            const result = await tool.execute('call_2', {
                owner: 'camp-candor',
                repo: '000.repo-bot',
                branch_name: 'main' as any,
                base_sha: 'a1b2c3d4e5f67890123456789012345678901234',
            })

            const receipt = parseReceipt(result)
            expect(receipt.status).toBe('FAILED')
            expect(receipt.error).toContain('SECURITY_BREACH')
        })

        it('scrubs tokens from error receipts if GitHub rejects the ref creation', async () => {
            globalThis.fetch = vi.fn().mockResolvedValue({
                ok: false,
                status: 401,
                json: async () => ({
                    message:
                        'Bad credentials for ghp_111122223333444455556666777788889999',
                }),
            } as any)

            const tool = createEphemeralBranchTool(mockEnv)
            const result = await tool.execute('call_3', {
                owner: 'camp-candor',
                repo: '000.repo-bot',
                branch_name: 'spec/TASK-01-a1b2c3d',
                base_sha: 'a1b2c3d4e5f67890123456789012345678901234',
            })

            const receipt = parseReceipt(result)
            expect(receipt.status).toBe('FAILED')
            expect(receipt.error).toContain('[REDACTED_GH_TOKEN]')
            expect(receipt.error).not.toContain('ghp_')
        })
    })

    describe('write_repo_file Guardrails', () => {
        it('rejects writes directed at non-spec or protected branches', async () => {
            const tool = createWriteRepoFileTool(mockEnv)
            const result = await tool.execute('call_w1', {
                owner: 'camp-candor',
                repo: '000.repo-bot',
                path: 'src/index.ts',
                content: 'console.log("danger")',
                commit_message: 'direct write',
                branch: 'main' as any,
            })

            const receipt = parseReceipt(result)
            expect(receipt.status).toBe('FAILED')
            expect(receipt.error).toContain('SECURITY_BREACH')
        })

        it('redacts tokens from GitHub API error responses', async () => {
            globalThis.fetch = vi.fn().mockResolvedValue({
                ok: false,
                status: 403,
                json: async () => ({
                    message:
                        'Forbidden access using token ghp_secretsecretsecretsecretsecretsecret',
                }),
            } as any)

            const tool = createWriteRepoFileTool(mockEnv)
            const result = await tool.execute('call_w2', {
                owner: 'camp-candor',
                repo: '000.repo-bot',
                path: 'docs/test.md',
                content: 'sample',
                commit_message: 'chore: test',
                branch: 'spec/TASK-01-a1b2c3d',
            })

            const receipt = parseReceipt(result)
            expect(receipt.status).toBe('FAILED')
            expect(receipt.error).toContain('[REDACTED_GH_TOKEN]')
            expect(receipt.error).not.toContain('ghp_secret')
        })
    })

    describe('create_pull_request Guardrails', () => {
        it('rejects PRs opened from non-spec branches', async () => {
            const tool = createPullRequestTool(mockEnv)
            const result = await tool.execute('call_pr1', {
                owner: 'camp-candor',
                repo: '000.repo-bot',
                title: 'unauthorized PR',
                body: 'body',
                head_branch: 'unauthorized-branch' as any,
                base_branch: 'main',
            })

            const receipt = parseReceipt(result)
            expect(receipt.status).toBe('FAILED')
            expect(receipt.error).toContain('SECURITY_BREACH')
        })
    })
})
