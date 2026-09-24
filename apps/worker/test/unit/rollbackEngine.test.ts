import { describe, it, expect, vi, beforeEach } from 'vitest'
import { executeCompensatingSaga } from '../../src/rollbackEngine.js'
import * as tools from '../../src/tools.js'

describe('FEAT-06: Compensating Saga Rollback Engine', () => {
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

    it('Tier-1 Pre-Merge: closes PR, posts tombstone, obliterates spec branch, and mutates Slack card', async () => {
        const githubSpy = vi
            .spyOn(tools, 'githubRequest')
            .mockImplementation(async (path, _env, opts) => {
                if (path.includes('/pulls/42') && opts?.method === 'PATCH') {
                    return { state: 'closed' }
                }
                if (
                    path.includes('/issues/42/comments') &&
                    opts?.method === 'POST'
                ) {
                    return { id: 101, body: 'tombstone' }
                }
                if (
                    path.includes('/git/refs/heads/spec/') &&
                    opts?.method === 'DELETE'
                ) {
                    return { action: 'DELETED' }
                }
                return {}
            })

        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ ok: true, ts: '1790000.0001' }),
        }) as any

        const result = await executeCompensatingSaga(
            {
                taskId: 'TASK-01',
                owner: 'camp-candor',
                repo: '000.repo-bot',
                pullNumber: 42,
                headSha: 'c7f4901b8e42f9a0d8431e21b7782a1290f12c34',
                branchName: 'spec/task-01-c7f4901',
                reason: 'HUMAN_REJECTED (Lead Architect Decision)',
                actor: 'U12345678',
                slackMessageTs: '1790000.0000',
                slackChannelId: 'C012345',
            },
            mockEnv,
        )

        expect(result.success).toBe(true)
        expect(result.isPostMerge).toBe(false)
        expect(result.prClosed).toBe(true)
        expect(result.branchDeleted).toBe(true)
        expect(result.slackUpdated).toBe(true)

        expect(githubSpy).toHaveBeenCalledWith(
            '/repos/camp-candor/000.repo-bot/pulls/42',
            mockEnv,
            expect.objectContaining({ method: 'PATCH' }),
        )
        expect(githubSpy).toHaveBeenCalledWith(
            '/repos/camp-candor/000.repo-bot/git/refs/heads/spec/task-01-c7f4901',
            mockEnv,
            expect.objectContaining({ method: 'DELETE' }),
        )
    })

    it('Branch Ref Protection: refuses to delete non-spec branch and aborts safely', async () => {
        const result = await executeCompensatingSaga(
            {
                taskId: 'TASK-01',
                owner: 'camp-candor',
                repo: '000.repo-bot',
                pullNumber: 42,
                headSha: 'c7f4901b8e42f9a0d8431e21b7782a1290f12c34',
                branchName: 'main', // Protected non-spec branch
                reason: 'Test safety violation',
            },
            mockEnv,
        )

        expect(result.branchDeleted).toBe(false)
        expect(result.success).toBe(false)
    })

    it('Tier-2 Post-Merge: triggers emergency alert and post-merge comment when mergeCommitSha is present', async () => {
        vi.spyOn(tools, 'githubRequest').mockImplementation(
            async (path, _env, _opts) => {
                if (path.includes('/issues/42/comments')) {
                    return { id: 102 }
                }
                return {}
            },
        )

        let emergencyAlertPayload: any = null
        global.fetch = vi
            .fn()
            .mockImplementation(async (url: string, opts: any) => {
                if (url.includes('slack.com/api/chat.postMessage')) {
                    emergencyAlertPayload = JSON.parse(opts.body)
                    return {
                        ok: true,
                        json: async () => ({ ok: true, ts: '1790999.0001' }),
                    }
                }
                if (url.includes('slack.com/api/chat.update')) {
                    return { ok: true, json: async () => ({ ok: true }) }
                }
                return { ok: true, json: async () => ({}) }
            }) as any

        const result = await executeCompensatingSaga(
            {
                taskId: 'TASK-01',
                owner: 'camp-candor',
                repo: '000.repo-bot',
                pullNumber: 42,
                headSha: 'c7f4901b8e42f9a0d8431e21b7782a1290f12c34',
                mergeCommitSha: '3a9f1bc111122223333444455556666777788889',
                reason: 'POST_MERGE_CANARY_HEALTH_FAILURE',
                actor: 'watchdog',
                slackMessageTs: '1790000.0000',
                slackChannelId: 'C012345',
            },
            mockEnv,
        )

        expect(result.success).toBe(true)
        expect(result.isPostMerge).toBe(true)
        expect(result.emergencyAlertSent).toBe(true)
        expect(emergencyAlertPayload).not.toBeNull()
        expect(emergencyAlertPayload.text).toContain('EMERGENCY ROLLBACK')
    })

    it('Idempotency & Resilience: absorbs 404 branch deletion and 422 PR closed errors cleanly', async () => {
        vi.spyOn(tools, 'githubRequest').mockImplementation(
            async (path, _env, _opts) => {
                if (path.includes('/pulls/42')) {
                    throw new Error('HTTP 422: Pull request already closed')
                }
                if (path.includes('/git/refs/heads/spec/')) {
                    throw new Error('HTTP 404: Reference does not exist')
                }
                return {}
            },
        )

        const result = await executeCompensatingSaga(
            {
                taskId: 'TASK-01',
                owner: 'camp-candor',
                repo: '000.repo-bot',
                pullNumber: 42,
                headSha: 'c7f4901b8e42f9a0d8431e21b7782a1290f12c34',
                branchName: 'spec/task-01-c7f4901',
                reason: 'Replay idempotency test',
            },
            mockEnv,
        )

        expect(result.prClosed).toBe(true)
        expect(result.branchDeleted).toBe(true)
        expect(result.success).toBe(true)
    })
})
