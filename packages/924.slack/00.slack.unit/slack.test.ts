import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
    initSlack,
    createSlackSignature,
    probeHandshake,
    simulateInteraction,
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

        // Mock global.LIBRARY console calls
        ;(global as any).LIBRARY = { hunt: vi.fn().mockResolvedValue({}) }

        await probeHandshake(model, { idx: 'probe', slv }, {} as any)
        expect(slv).toHaveBeenCalled()
        const result = slv.mock.calls[0][0]
        expect(result.olmBit.idx).toBe('probe-handshake')
    })

    it('simulates interaction with proper headers and form body', async () => {
        const model = new SlackModel()
        const slv = vi.fn()

        let requestHeaders: Record<string, string> = {}
        let requestBody = ''

        global.fetch = vi.fn().mockImplementation((url, init) => {
            requestHeaders = init.headers
            requestBody = init.body
            return Promise.resolve({
                ok: true,
                status: 200,
                text: async () =>
                    JSON.stringify({
                        response_type: 'ephemeral',
                        text: 'Processing',
                    }),
            })
        }) as any

        ;(global as any).LIBRARY = { hunt: vi.fn().mockResolvedValue({}) }

        await simulateInteraction(
            model,
            { idx: 'sim', src: 'APPROVE', slv },
            {} as any,
        )

        expect(requestHeaders['Content-Type']).toBe(
            'application/x-www-form-urlencoded',
        )
        expect(requestHeaders['X-Slack-Signature']).toMatch(/^v0=[a-f0-9]{64}$/)
        expect(requestBody).toContain('payload=')
        expect(slv).toHaveBeenCalled()
    })
})
