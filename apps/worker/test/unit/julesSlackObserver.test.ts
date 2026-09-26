import { describe, it, expect, vi, afterEach } from 'vitest'
import { buildJulesStatusCard } from '../../src/slackBridge.js'
import { resolveJulesSource } from '../../src/jules.js'

describe('Jules Slack Observer Card Colors & Button Architecture', () => {
    const mockEnv = {
        SLACK_JULES_CHANNEL_ID: 'C0C4CK27LA1',
        SLACK_CHANNEL_ID: 'C0C40FMRQ9H',
    }

    it('builds READY_FOR_REVIEW card with Emerald Green (#2EB886) attachment bar', () => {
        const card = buildJulesStatusCard(
            {
                sessionId: 'session_abc123',
                repo: 'slopratchet/000.alligator.ink',
                taskId: 'feat/history-007-dossier',
                status: 'READY_FOR_REVIEW',
                prUrl: 'https://github.com/slopratchet/000.alligator.ink/pull/14',
                branchName: 'feat/history-007-dossier',
                queryText:
                    'Generates structured JSON dossier for history collection.',
            },
            mockEnv,
        )

        expect(card.channel).toBe('C0C4CK27LA1')
        expect(card.attachments).toBeDefined()
        expect(card.attachments[0].color).toBe('#2EB886')

        const actionBlock = card.attachments[0].blocks.find(
            (b: any) => b.type === 'actions',
        )
        expect(actionBlock).toBeDefined()

        const prButton = actionBlock.elements.find(
            (el: any) =>
                el.url ===
                'https://github.com/slopratchet/000.alligator.ink/pull/14',
        )
        expect(prButton).toBeDefined()
        expect(prButton.text.text).toBe('View Pull Request [GitHub]')
        expect(prButton.action_id).toBeUndefined() // Verified clean link button (zero backend overhead)
    })

    it('builds MERGED card with Slate Grey (#86888A) attachment bar', () => {
        const card = buildJulesStatusCard(
            {
                sessionId: 'session_abc123',
                repo: 'camp-candor/000.repo-bot',
                taskId: 'bump-version-5040221361492999795',
                status: 'MERGED',
                prUrl: 'https://github.com/camp-candor/000.repo-bot/pull/83',
                branchName: 'bump-version-5040221361492999795',
                queryText: 'Merged into main by elliotbradly.',
            },
            mockEnv,
        )

        expect(card.channel).toBe('C0C4CK27LA1')
        expect(card.attachments).toBeDefined()
        expect(card.attachments[0].color).toBe('#86888A')

        const headerBlock = card.attachments[0].blocks.find(
            (b: any) => b.type === 'header',
        )
        expect(headerBlock.text.text).toBe(':: Jules PR Merged into Trunk')

        const actionBlock = card.attachments[0].blocks.find(
            (b: any) => b.type === 'actions',
        )
        const prButton = actionBlock.elements.find((el: any) =>
            el.url.includes('pull/83'),
        )
        expect(prButton.text.text).toBe('View Merged PR [GitHub]')
        expect(prButton.action_id).toBeUndefined()
    })

    it('builds INPUT_REQUIRED card with Amber Yellow (#ECB22E) attachment bar', () => {
        const card = buildJulesStatusCard(
            {
                sessionId: '13980471994167374037',
                repo: 'camp-candor/000.repo-bot',
                taskId: 'TASK-04.02',
                status: 'INPUT_REQUIRED',
                queryText: 'Does everything look correct so far?',
            },
            mockEnv,
        )

        expect(card.attachments[0].color).toBe('#ECB22E')
        const actionBlock = card.attachments[0].blocks.find(
            (b: any) => b.type === 'actions',
        )
        const sessionButton = actionBlock.elements.find((el: any) =>
            el.url.includes('13980471994167374037'),
        )
        expect(sessionButton.text.text).toContain('Open Session in Jules')
    })
})

describe('resolveJulesSource Dynamic Entity Resolution', () => {
    const originalFetch = globalThis.fetch

    afterEach(() => {
        globalThis.fetch = originalFetch
    })

    it('resolves canonical source matching githubRepo owner and repo', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                sources: [
                    {
                        name: 'sources/github/camp-candor/000.repo-bot',
                        id: 'github/camp-candor/000.repo-bot',
                        githubRepo: {
                            owner: 'camp-candor',
                            repo: '000.repo-bot',
                        },
                    },
                ],
            }),
        } as any)

        const sourceName = await resolveJulesSource(
            'camp-candor',
            '000.repo-bot',
            'test-api-key',
        )
        expect(sourceName).toBe('sources/github/camp-candor/000.repo-bot')
        expect(globalThis.fetch).toHaveBeenCalledWith(
            'https://jules.googleapis.com/v1alpha/sources',
            expect.objectContaining({
                headers: {
                    'x-goog-api-key': 'test-api-key',
                    'Content-Type': 'application/json',
                },
            }),
        )
    })

    it('resolves canonical source matching githubRepoContext or github', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                sources: [
                    {
                        name: 'sources/98765',
                        githubRepoContext: {
                            owner: 'camp-candor',
                            repo: '000.repo-bot',
                        },
                    },
                ],
            }),
        } as any)

        const sourceName = await resolveJulesSource(
            'camp-candor',
            '000.repo-bot',
            'test-api-key',
        )
        expect(sourceName).toBe('sources/98765')
    })

    it('resolves canonical source matching id or source name segment', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                sources: [
                    {
                        name: 'sources/github/camp-candor/995.library',
                        id: 'github/camp-candor/995.library',
                    },
                ],
            }),
        } as any)

        const sourceName = await resolveJulesSource(
            'camp-candor',
            '995.library',
            'test-api-key',
        )
        expect(sourceName).toBe('sources/github/camp-candor/995.library')
    })

    it('throws fail-closed error with connected sources when repo is unmapped', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                sources: [
                    {
                        name: 'sources/github/camp-candor/995.library',
                        githubRepo: {
                            owner: 'camp-candor',
                            repo: '995.library',
                        },
                    },
                ],
            }),
        } as any)

        await expect(
            resolveJulesSource(
                'camp-candor',
                'unconnected-repo',
                'test-api-key',
            ),
        ).rejects.toThrow(
            /Repository 'camp-candor\/unconnected-repo' is not connected in Google Jules/,
        )
    })

    it('throws descriptive error when Jules API query fails', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 403,
            text: async () => 'API key invalid',
        } as any)

        await expect(
            resolveJulesSource('camp-candor', '000.repo-bot', 'bad-key'),
        ).rejects.toThrow(
            /Failed to query Jules sources \(403\): API key invalid/,
        )
    })
})
