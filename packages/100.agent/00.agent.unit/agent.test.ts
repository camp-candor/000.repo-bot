import { describe, it, expect, vi } from 'vitest'
import { initagent } from './buz/agent.buzz.js'
import { AgentModel } from './agent.model.js'

describe('agent', () => {
    it('should initialize agent', () => {
        const model = new AgentModel()
        const state = {
            hunt: vi.fn().mockResolvedValue({}),
            dispatch: vi.fn(),
        } as any

        const slv = vi.fn()
        const bal = { idx: 'test', slv } as any

        // Check if initagent is a function and can be called
        expect(typeof initagent).toBe('function')

        const result = initagent(model, bal, state)
        expect(result).toBe(model)
        //expect(slv).toHaveBeenCalledWith({ intBit: { idx: 'init-agent' } });
    })

    it('should wake up the agent if url is provided', async () => {
        const model = new AgentModel()
        const state = {} as any
        const slv = vi.fn()
        const bal = { idx: 'test', slv } as any

        const urlagent = 'https://zero00-agent.onrender.com/api/agent/test'

        const mockResponseagent = { status: 'agent-awake' }

        const globalFetch = vi
            .spyOn(global, 'fetch')
            .mockImplementation((url) => {
                if (url === urlagent) {
                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve(mockResponseagent),
                    } as any)
                }
                return Promise.reject(new Error('Unknown URL'))
            })

        initagent(model, bal, state)

        // Wait for the promise in initagent to resolve
        await new Promise((resolve) => setTimeout(resolve, 0))

        expect(globalFetch).toHaveBeenCalledWith(urlagent)
        expect(slv).toHaveBeenCalledWith({
            intBit: {
                idx: 'init-agent',
                dat: {
                    agent: mockResponseagent,
                },
            },
        })

        globalFetch.mockRestore()
    })

    it('should handle fetch errors', async () => {
        const model = new AgentModel()
        const state = {} as any
        const slv = vi.fn()
        const bal = { idx: 'test', slv } as any

        const urlagent = 'https://zero00-agent.onrender.com/api/agent/test'

        const errorMessage = 'Network error'
        const globalFetch = vi
            .spyOn(global, 'fetch')
            .mockImplementation((url) => {
                if (url === urlagent) {
                    return Promise.reject(new Error(errorMessage))
                }
                return Promise.resolve({
                    ok: true,
                    json: async () => ({}),
                } as any)
            })

        initagent(model, bal, state)

        // Wait for the promise in initagent to resolve
        await new Promise((resolve) => setTimeout(resolve, 0))

        expect(globalFetch).toHaveBeenCalledWith(urlagent)

        expect(slv).toHaveBeenCalledWith({
            intBit: { idx: 'init-agent-err', dat: errorMessage },
        })

        globalFetch.mockRestore()
    })
})
