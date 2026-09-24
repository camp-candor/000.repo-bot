import { describe, it, expect, vi } from 'vitest'
import { initGithub } from './buz/github.buzz.js'
import { GithubModel } from './github.model.js'

describe('github', () => {
    it('should initialize github', async () => {
        const model = new GithubModel()
        const state = {
            hunt: vi.fn().mockResolvedValue({}),
            dispatch: vi.fn(),
        } as any

        const slv = vi.fn()
        const bal = { idx: 'test', slv } as any

        // Check if initGithub is a function and can be called
        expect(typeof initGithub).toBe('function')

        const result = await initGithub(model, bal, state)
        expect(result).toBe(model)
        //expect(slv).toHaveBeenCalledWith({ intBit: { idx: 'init-github' } });
    })

    it('should wake up the github if url is provided', async () => {
        const model = new GithubModel()
        const state = {} as any
        const slv = vi.fn()
        const bal = { idx: 'test', slv } as any

        const urlgithub =
            'https://repo-bot-00.berad4000.workers.dev/api/github/test'

        const mockResponsegithub = { status: 'github-awake' }

        const globalFetch = vi
            .spyOn(global, 'fetch')
            .mockImplementation((url) => {
                if (url === urlgithub) {
                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve(mockResponsegithub),
                    } as any)
                }
                return Promise.reject(new Error('Unknown URL'))
            })

        initGithub(model, bal, state)

        // Wait for the promise in initGithub to resolve
        await new Promise((resolve) => setTimeout(resolve, 0))

        expect(globalFetch).toHaveBeenCalledWith(urlgithub)
        expect(slv).toHaveBeenCalledWith({
            intBit: {
                idx: 'init-github',
                dat: {
                    github: mockResponsegithub,
                },
            },
        })

        globalFetch.mockRestore()
    })

    it('should handle fetch errors', async () => {
        const model = new GithubModel()
        const state = {} as any
        const slv = vi.fn()
        const bal = { idx: 'test', slv } as any

        const urlgithub =
            'https://repo-bot-00.berad4000.workers.dev/api/github/test'

        const errorMessage = 'Network error'
        const globalFetch = vi
            .spyOn(global, 'fetch')
            .mockImplementation((url) => {
                if (url === urlgithub) {
                    return Promise.reject(new Error(errorMessage))
                }
                return Promise.resolve({
                    ok: true,
                    json: async () => ({}),
                } as any)
            })

        initGithub(model, bal, state)

        // Wait for the promise in initGithub to resolve
        await new Promise((resolve) => setTimeout(resolve, 0))

        expect(globalFetch).toHaveBeenCalledWith(urlgithub)

        expect(slv).toHaveBeenCalledWith({
            intBit: { idx: 'init-github-err', dat: errorMessage },
        })

        globalFetch.mockRestore()
    })
})
