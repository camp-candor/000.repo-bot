import { describe, it, expect } from 'vitest'
import { buildJulesStatusCard } from '../../src/slackBridge.js'

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
