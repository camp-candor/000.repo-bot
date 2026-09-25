import { describe, it, expect, vi } from 'vitest'
import { initJules } from './buz/jules.buzz.js'
import { JulesModel } from './jules.model.js'

describe('jules', () => {
    it('should initialize jules', () => {
        const model = new JulesModel()
        const state = {
            hunt: vi.fn().mockResolvedValue({}),
            dispatch: vi.fn(),
        } as any

        const slv = vi.fn()
        const bal = { idx: 'test', slv } as any

        // Check if initJules is a function and can be called
        expect(typeof initJules).toBe('function')

        const result = initJules(model, bal, state)
        expect(result).toBe(model)
        //expect(slv).toHaveBeenCalledWith({ intBit: { idx: 'init-jules' } });
    })

    it('should wake up the jules if url is provided', async () => {
        const model = new JulesModel()
        const state = {} as any
        const slv = vi.fn()
        const bal = { idx: 'test', slv } as any

        const urljules = 'https://zero00-jules.onrender.com/api/jules/test'

        const mockResponsejules = { status: 'jules-awake' }

        const globalFetch = vi
            .spyOn(global, 'fetch')
            .mockImplementation((url) => {
                if (url === urljules) {
                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve(mockResponsejules),
                    } as any)
                }
                return Promise.reject(new Error('Unknown URL'))
            })

        initJules(model, bal, state)

        // Wait for the promise in initJules to resolve
        await new Promise((resolve) => setTimeout(resolve, 0))

        expect(globalFetch).toHaveBeenCalledWith(urljules)
        expect(slv).toHaveBeenCalledWith({
            intBit: {
                idx: 'init-jules',
                dat: {
                    jules: mockResponsejules,
                },
            },
        })

        globalFetch.mockRestore()
    })

    it('should handle fetch errors', async () => {
        const model = new JulesModel()
        const state = {} as any
        const slv = vi.fn()
        const bal = { idx: 'test', slv } as any

        const urljules = 'https://zero00-jules.onrender.com/api/jules/test'

        const errorMessage = 'Network error'
        const globalFetch = vi
            .spyOn(global, 'fetch')
            .mockImplementation((url) => {
                if (url === urljules) {
                    return Promise.reject(new Error(errorMessage))
                }
                return Promise.resolve({
                    ok: true,
                    json: async () => ({}),
                } as any)
            })

        initJules(model, bal, state)

        // Wait for the promise in initJules to resolve
        await new Promise((resolve) => setTimeout(resolve, 0))

        expect(globalFetch).toHaveBeenCalledWith(urljules)

        expect(slv).toHaveBeenCalledWith({
            intBit: { idx: 'init-jules-err', dat: errorMessage },
        })

        globalFetch.mockRestore()
    })
})
