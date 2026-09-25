import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
    initSlack,
    createSlackSignature,
    probeHandshake,
    simulateInteraction,
    dispatchJulesTestCard,
} from './buz/slack.buzz.js'
import { SlackModel } from './slack.model.js'

describe('Slack Unit & Test Deck Operations', () => {
    beforeEach(() => {
        vi.restoreAllMocks()
    })

    it('initializes slack model', () => {
        const model = new SlackModel()
        const slv = vi.fn()
        const res = initSlack(model, { idx: 'init', slv }, {} as any)
        expect(res).toBe(model)
        expect(slv).toHaveBeenCalledWith({ intBit: { idx: 'init-slack' } })
    })

    it('creates deterministic HMAC-SHA256 signature format', () => {
        const sig = createSlackSignature(
            'payload=%7B%7D',
            1700000000,
            'test_secret',
        )
        expect(sig).toMatch(/^v0=[a-f0-9]{64}$/)
    })

    it('probes handshake and handles successful verification response', async () => {
        const model = new SlackModel()
        const slv = vi.fn()

        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            text: async () =>
                JSON.stringify({ challenge: 'test-challenge-token' }),
        }) as any
        ;(global as any).LIBRARY = { hunt: vi.fn().mockResolvedValue({}) }

        await probeHandshake(model, { idx: 'probe', slv }, {} as any)
        expect(slv).toHaveBeenCalled()
        const result = slv.mock.calls[0][0]
        expect(result.olmBit.idx).toBe('probe-handshake')
    })

    it('dispatches test card specifically targeting #jules-winnfield (C0C4CK27LA1)', async () => {
        const model = new SlackModel()
        const slv = vi.fn()
        let sentBody: any = null

        process.env.SLACK_BOT_TOKEN = 'xoxb-mock-token'
        process.env.SLACK_JULES_CHANNEL_ID = 'C0C4CK27LA1'

        global.fetch = vi.fn().mockImplementation((url, init) => {
            sentBody = JSON.parse(init.body)
            return Promise.resolve({
                ok: true,
                status: 200,
                json: async () => ({
                    ok: true,
                    ts: '1790999.0001',
                    channel: 'C0C4CK27LA1',
                }),
            })
        }) as any
        ;(global as any).LIBRARY = { hunt: vi.fn().mockResolvedValue({}) }

        await dispatchJulesTestCard(
            model,
            { idx: 'jules-test', slv },
            {} as any,
        )

        expect(slv).toHaveBeenCalled()
        expect(sentBody).not.toBeNull()
        expect(sentBody.channel).toBe('C0C4CK27LA1')
        expect(sentBody.text).toContain('camp-candor/000.repo-bot')

        const actionBlock = sentBody.blocks.find(
            (b: any) => b.type === 'actions',
        )
        expect(actionBlock).toBeDefined()
        expect(actionBlock.elements[0].url).toContain('https://github.com')
        expect(actionBlock.elements[1].url).toContain(
            'https://jules.google.com/session/',
        )
    })
})
