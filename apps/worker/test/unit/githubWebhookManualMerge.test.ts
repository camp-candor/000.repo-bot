import { describe, it, expect, vi, beforeEach } from 'vitest'
import { postSlackMergeAnnouncement } from '../../src/slackBridge.js'
import type { Env } from '../../src/tools.js'

describe('GitHub Webhook: Manual GitHub UI Merge Detection', () => {
    const mockEnv: Env = {
        CLOUDFLARE_ACCOUNT_ID: 'test-acc',
        CLOUDFLARE_API_TOKEN: 'test-token',
        CLOUDFLARE_AI_GATEWAY: 'test-gw',
        GITHUB_TOKEN: 'test-token',
        GH_WEBHOOK_SECRET: 'test-webhook-secret',
        SLACK_BOT_TOKEN: 'xoxb-test-token',
        SLACK_CHANNEL_ID: '#ops-bridge',
        AI: {} as any,
        REPO_BOT_DO: {} as any,
    }

    beforeEach(() => {
        vi.restoreAllMocks()
    })

    it('formats expressive Slack Block Kit notification explicitly declaring GITHUB_MANUAL_UI origin', async () => {
        let sentPayload: any = null
        global.fetch = vi
            .fn()
            .mockImplementation(async (url: string, opts: any) => {
                if (url.includes('https://slack.com/api/chat.postMessage')) {
                    sentPayload = JSON.parse(opts.body)
                    return {
                        ok: true,
                        json: async () => ({ ok: true, ts: '1790999.0001' }),
                    }
                }
                return { ok: true, json: async () => ({}) }
            }) as any

        const result = await postSlackMergeAnnouncement(
            {
                taskId: 'PR-50',
                pullNumber: 50,
                prTitle: 'feat: implement blessed merge logic',
                mergeCommitSha: '3a9f1bc111122223333444455556666777788889',
                auditedHeadSha: 'ed9c012111122223333444455556666777788889',
                targetBranch: 'main',
                branchName: 'feat-blessed-merge-13882375419791356382',
                actor: 'elliotbradly',
                owner: 'camp-candor',
                repo: '000.repo-bot',
                origin: 'GITHUB_MANUAL_UI',
            },
            mockEnv,
        )

        expect(result.ok).toBe(true)
        expect(sentPayload).not.toBeNull()
        expect(['C0C40FMRQ9H', '#ops-bridge']).toContain(sentPayload.channel)

        // Verify explicit external/manual markers in blocks
        const headerBlock = sentPayload.blocks.find(
            (b: any) => b.type === 'header',
        )
        expect(headerBlock.text.text).toContain(
            'GITHUB MANUAL MERGE DETECTED (PR #50)',
        )

        const sectionBlock = sentPayload.blocks.find(
            (b: any) => b.type === 'section',
        )
        const mrkdwnText = sectionBlock.text.text

        expect(mrkdwnText).toContain(
            '[ORIGIN: DIRECT GITHUB WEB CONSOLE / EXTERNAL ACTOR]',
        )
        expect(mrkdwnText).toContain(
            'This merge was executed directly on GitHub, outside the Repo-Bot CAS verification executor.',
        )
        expect(mrkdwnText).toContain('*Merged By:* *elliotbradly*')
        expect(mrkdwnText).toContain('feat-blessed-merge-13882375419791356382')
        expect(mrkdwnText).toContain(
            '#50 - feat: implement blessed merge logic',
        )
    })

    it('retains standard CAS executor block format when origin is REPO_BOT_CAS', async () => {
        let sentPayload: any = null
        global.fetch = vi
            .fn()
            .mockImplementation(async (url: string, opts: any) => {
                if (url.includes('https://slack.com/api/chat.postMessage')) {
                    sentPayload = JSON.parse(opts.body)
                    return {
                        ok: true,
                        json: async () => ({ ok: true, ts: '1790999.0002' }),
                    }
                }
                return { ok: true, json: async () => ({}) }
            }) as any

        const result = await postSlackMergeAnnouncement(
            {
                taskId: 'TASK-04.01',
                pullNumber: 42,
                mergeCommitSha: '1111222233334444555566667777888899990000',
                auditedHeadSha: 'c7f4901b8e42f9a0d8431e21b7782a1290f12c34',
                targetBranch: 'main',
                actor: 'LEAD_ARCHITECT',
                owner: 'camp-candor',
                repo: '000.repo-bot',
                origin: 'REPO_BOT_CAS',
            },
            mockEnv,
        )

        expect(result.ok).toBe(true)
        const headerBlock = sentPayload.blocks.find(
            (b: any) => b.type === 'header',
        )
        expect(headerBlock.text.text).toContain(':: MERGE COMPLETE: TASK-04.01')

        const sectionBlock = sentPayload.blocks.find(
            (b: any) => b.type === 'section',
        )
        expect(sectionBlock.text.text).toContain(
            '[ORIGIN: REPO-BOT CAS MERGE EXECUTOR]',
        )
    })
})
