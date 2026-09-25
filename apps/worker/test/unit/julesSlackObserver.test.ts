import { describe, it, expect, vi } from 'vitest'
import { buildJulesStatusCard } from '../../src/slackBridge.js'

describe('Jules Slack Observer & Winnfield Bridge', () => {
    const mockEnv = {
        SLACK_JULES_CHANNEL_ID: 'C0C4CK27LA1',
        SLACK_CHANNEL_ID: 'C0C40FMRQ9H',
    }

    it('builds Ready for Review card targeting #jules-winnfield with direct GitHub PR button', () => {
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
        expect(card.text).toContain('slopratchet/000.alligator.ink')

        // Assert action buttons
        const actionBlock = card.blocks.find((b: any) => b.type === 'actions')
        expect(actionBlock).toBeDefined()

        const prButton = actionBlock.elements.find(
            (el: any) =>
                el.url ===
                'https://github.com/slopratchet/000.alligator.ink/pull/14',
        )
        expect(prButton).toBeDefined()
        expect(prButton.text.text).toContain('View Pull Request')

        const sessionButton = actionBlock.elements.find(
            (el: any) =>
                el.url === 'https://jules.google.com/session/session_abc123',
        )
        expect(sessionButton).toBeDefined()
    })

    it('builds Input Required card with direct link to Jules session tab', () => {
        const card = buildJulesStatusCard(
            {
                sessionId: '13980471994167374037',
                repo: 'camp-candor/000.repo-bot',
                taskId: 'TASK-04.02',
                status: 'INPUT_REQUIRED',
                queryText:
                    'Does everything look correct so far or would you like me to make any adjustments?',
            },
            mockEnv,
        )

        expect(card.channel).toBe('C0C4CK27LA1')
        expect(card.text).toContain('camp-candor/000.repo-bot')
        expect(card.blocks[0].text.text).toBe(
            ':: Jules Requires Operator Feedback',
        )

        const actionBlock = card.blocks.find((b: any) => b.type === 'actions')
        const sessionButton = actionBlock.elements.find(
            (el: any) =>
                el.url ===
                'https://jules.google.com/session/13980471994167374037',
        )
        expect(sessionButton).toBeDefined()
        expect(sessionButton.text.text).toContain('Open Session in Jules')
    })

    it('falls back to default C0C4CK27LA1 when SLACK_JULES_CHANNEL_ID is empty', () => {
        const card = buildJulesStatusCard(
            {
                sessionId: 'test_123',
                repo: 'astro-kahn-it-com/001.goblin-lore',
                status: 'INPUT_REQUIRED',
            },
            {},
        )

        expect(card.channel).toBe('C0C4CK27LA1')
    })
})
