import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { initagent } from './buz/agent.buzz.js'
import { AgentModel } from './agent.model.js'
import { getBaseUrl } from '../src/cascade.js'

describe('agent unit buzzers', () => {
    const originalFetch = globalThis.fetch

    beforeEach(() => {
        vi.restoreAllMocks()
        delete (global as any).agentBaseUrl
    })

    afterEach(() => {
        globalThis.fetch = originalFetch
        delete (global as any).agentBaseUrl
    })

    it('should query health endpoint on initagent', async () => {
        const model = new AgentModel()
        const state = {} as any
        const slv = vi.fn()
        const bal = { idx: 'test', slv } as any

        const expectedUrl = `${getBaseUrl()}/health`
        const mockHealth = { status: 'healthy', service: 'repo-bot-worker' }

        globalThis.fetch = vi.fn().mockImplementation((url: string) => {
            if (url === expectedUrl) {
                return Promise.resolve({
                    ok: true,
                    json: async () => mockHealth,
                } as any)
            }
            return Promise.reject(new Error(`Unexpected url: ${url}`))
        })

        initagent(model, bal, state)

        await new Promise((resolve) => setTimeout(resolve, 10))

        expect(globalThis.fetch).toHaveBeenCalledWith(expectedUrl)
        expect(slv).toHaveBeenCalledWith({
            intBit: {
                idx: 'init-agent',
                dat: {
                    status: 'connected',
                    health: mockHealth,
                },
            },
        })
    })

    it('should handle fetch errors gracefully on initagent', async () => {
        const model = new AgentModel()
        const state = {} as any
        const slv = vi.fn()
        const bal = { idx: 'test', slv } as any

        globalThis.fetch = vi
            .fn()
            .mockRejectedValue(new Error('Network offline'))

        initagent(model, bal, state)

        await new Promise((resolve) => setTimeout(resolve, 10))

        expect(slv).toHaveBeenCalledWith({
            intBit: { idx: 'init-agent-err', dat: 'Network offline' },
        })
    })
})
