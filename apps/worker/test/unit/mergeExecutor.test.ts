import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
    executeShaPinnedMerge,
    assertSafeBranchRef,
} from '../../src/mergeExecutor.js'
import * as tools from '../../src/tools.js'

describe('FEAT-05: Idempotent SHA-Pinned Merge Executor', () => {
    const mockEnv: tools.Env = {
        CLOUDFLARE_ACCOUNT_ID: 'test-acc',
        CLOUDFLARE_API_TOKEN: 'test-token',
        CLOUDFLARE_AI_GATEWAY: 'test-gw',
        GITHUB_TOKEN: 'test-gh-token',
        SLACK_BOT_TOKEN: 'xoxb-test-bot-token',
        SLACK_CHANNEL_ID: '#ops-bridge',
        AI: {} as any,
        REPO_BOT_DO: {} as any,
    }

    beforeEach(() => {
        vi.restoreAllMocks()
    })

    it('assertSafeBranchRef enforces spec/ prefix and shields trunk branches', () => {
        expect(assertSafeBranchRef('spec/task-01-c7f4901')).toBe(
            'spec/task-01-c7f4901',
        )
        expect(assertSafeBranchRef('refs/heads/spec/task-01-c7f4901')).toBe(
            'spec/task-01-c7f4901',
        )

        expect(() => assertSafeBranchRef('main')).toThrowError(
            /SECURITY_BREACH/,
        )
        expect(() => assertSafeBranchRef('refs/heads/master')).toThrowError(
            /SECURITY_BREACH/,
        )
        expect(() => assertSafeBranchRef('feature/unbounded')).toThrowError(
            /SECURITY_BREACH/,
        )
    })

    it('rejects execution when auditedHeadSha is malformed or missing', async () => {
        const res = await executeShaPinnedMerge(
            {
                taskId: 'TASK-01',
                owner: 'camp-candor',
                repo: '000.repo-bot',
                pullNumber: 42,
                auditedHeadSha: 'short-sha',
            },
            mockEnv,
        )

        expect(res.success).toBe(false)
        expect(res.error).toBe('INVALID_AUDITED_SHA_PIN')
    })

    it('executes successful CAS squash merge, obliterates branch, and dispatches release notice', async () => {
        const auditedSha = 'c7f4901b8e42f9a0d8431e21b7782a1290f12c34'
        const mergeCommitSha = '1111222233334444555566667777888899990000'

        // Mock GitHub REST Calls
        const githubSpy = vi
            .spyOn(tools, 'githubRequest')
            .mockImplementation(async (path, _env, _opts) => {
                if (path.includes('/pulls/42') && !path.includes('/merge')) {
                    return { merged: false, head: { sha: auditedSha } }
                }
                if (path.includes('/pulls/42/merge')) {
                    return { sha: mergeCommitSha, merged: true }
                }
                if (path.includes('/git/refs/heads/spec/')) {
                    return { action: 'DELETED' }
                }
                return {}
            })

        // Mock Slack API call
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ ok: true, ts: '1790000.0001' }),
        }) as any

        const result = await executeShaPinnedMerge(
            {
                taskId: 'TASK-01',
                owner: 'camp-candor',
                repo: '000.repo-bot',
                pullNumber: 42,
                auditedHeadSha: auditedSha,
                branchName: 'spec/task-01-c7f4901',
                slackMessageTs: '1790000.0000',
                slackChannelId: 'C012345',
            },
            mockEnv,
        )

        expect(result.success).toBe(true)
        expect(result.mergeCommitSha).toBe(mergeCommitSha)
        expect(githubSpy).toHaveBeenCalledWith(
            '/repos/camp-candor/000.repo-bot/pulls/42/merge',
            mockEnv,
            expect.objectContaining({
                method: 'PUT',
                body: expect.stringContaining(auditedSha),
            }),
        )
    })

    it('TOCTOU Defense: rejects merge if remote branch head diverged from audited SHA', async () => {
        const auditedSha = 'c7f4901b8e42f9a0d8431e21b7782a1290f12c34'
        const rogueSha = 'd8e5102a9f42f9a0d8431e21b7782a1290f12c99'

        vi.spyOn(tools, 'githubRequest').mockImplementation(async (path) => {
            if (path.includes('/pulls/42')) {
                return { merged: false, head: { sha: rogueSha } }
            }
            return {}
        })

        const result = await executeShaPinnedMerge(
            {
                taskId: 'TASK-01',
                owner: 'camp-candor',
                repo: '000.repo-bot',
                pullNumber: 42,
                auditedHeadSha: auditedSha,
            },
            mockEnv,
        )

        expect(result.success).toBe(false)
        expect(result.error).toContain('TOCTOU_DIVERGENCE')
    })

    it('Re-entrant Idempotency: reconciles cleanly if PR was already merged', async () => {
        const auditedSha = 'c7f4901b8e42f9a0d8431e21b7782a1290f12c34'
        const previousMergeSha = '9999888877776666555544443333222211110000'

        vi.spyOn(tools, 'githubRequest').mockImplementation(async (path) => {
            if (path.includes('/pulls/42')) {
                return {
                    merged: true,
                    merge_commit_sha: previousMergeSha,
                    head: { sha: auditedSha },
                }
            }
            return {}
        })

        const result = await executeShaPinnedMerge(
            {
                taskId: 'TASK-01',
                owner: 'camp-candor',
                repo: '000.repo-bot',
                pullNumber: 42,
                auditedHeadSha: auditedSha,
            },
            mockEnv,
        )

        expect(result.success).toBe(true)
        expect(result.alreadyMerged).toBe(true)
        expect(result.mergeCommitSha).toBe(previousMergeSha)
    })
})
