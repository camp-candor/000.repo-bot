import { describe, it, expect, vi } from 'vitest'
import { initGemini } from './buz/gemini.buzz.js'
import { GeminiModel } from './gemini.model.js'

describe('gemini', () => {
    it('should initialize gemini', () => {
        const model = new GeminiModel()
        const state = {
            hunt: vi.fn().mockResolvedValue({}),
            dispatch: vi.fn(),
        } as any

        const slv = vi.fn()
        const bal = { idx: 'test', slv } as any

        // Check if initGemini is a function and can be called
        expect(typeof initGemini).toBe('function')

        const result = initGemini(model, bal, state)
        expect(result).toBe(model)
        //expect(slv).toHaveBeenCalledWith({ intBit: { idx: 'init-gemini' } });
    })

    it('should wake up the gemini if url is provided', async () => {
        const model = new GeminiModel()
        const state = {} as any
        const slv = vi.fn()
        const bal = { idx: 'test', slv } as any

        const urlgemini = 'https://zero00-gemini.onrender.com/api/gemini/test'

        const mockResponsegemini = { status: 'gemini-awake' }

        const globalFetch = vi
            .spyOn(global, 'fetch')
            .mockImplementation((url) => {
                if (url === urlgemini) {
                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve(mockResponsegemini),
                    } as any)
                }
                return Promise.reject(new Error('Unknown URL'))
            })

        initGemini(model, bal, state)

        // Wait for the promise in initGemini to resolve
        await new Promise((resolve) => setTimeout(resolve, 0))

        expect(globalFetch).toHaveBeenCalledWith(urlgemini)
        expect(slv).toHaveBeenCalledWith({
            intBit: {
                idx: 'init-gemini',
                dat: {
                    gemini: mockResponsegemini,
                },
            },
        })

        globalFetch.mockRestore()
    })

    it('should handle fetch errors', async () => {
        const model = new GeminiModel()
        const state = {} as any
        const slv = vi.fn()
        const bal = { idx: 'test', slv } as any

        const urlgemini = 'https://zero00-gemini.onrender.com/api/gemini/test'

        const errorMessage = 'Network error'
        const globalFetch = vi
            .spyOn(global, 'fetch')
            .mockImplementation((url) => {
                if (url === urlgemini) {
                    return Promise.reject(new Error(errorMessage))
                }
                return Promise.resolve({
                    ok: true,
                    json: async () => ({}),
                } as any)
            })

        initGemini(model, bal, state)

        // Wait for the promise in initGemini to resolve
        await new Promise((resolve) => setTimeout(resolve, 0))

        expect(globalFetch).toHaveBeenCalledWith(urlgemini)

        expect(slv).toHaveBeenCalledWith({
            intBit: { idx: 'init-gemini-err', dat: errorMessage },
        })

        globalFetch.mockRestore()
    })
})
