import { describe, it, expect, vi } from 'vitest'
import { initFactory } from './buz/factory.buzz.js'
import { FactoryModel } from './factory.model.js'

describe('factory', () => {
    it('should initialize factory', () => {
        const model = new FactoryModel()
        const state = {
            hunt: vi.fn().mockResolvedValue({}),
            dispatch: vi.fn(),
        } as any

        const slv = vi.fn()
        const bal = { idx: 'test', slv } as any

        // Check if initFactory is a function and can be called
        expect(typeof initFactory).toBe('function')

        const result = initFactory(model, bal, state)
        expect(result).toBe(model)
        //expect(slv).toHaveBeenCalledWith({ intBit: { idx: 'init-factory' } });
    })

    it('should wake up the factory if url is provided', async () => {
        const model = new FactoryModel()
        const state = {} as any
        const slv = vi.fn()
        const bal = { idx: 'test', slv } as any

        const urlfactory =
            'https://zero00-factory.onrender.com/api/factory/test'

        const mockResponsefactory = { status: 'factory-awake' }

        const globalFetch = vi
            .spyOn(global, 'fetch')
            .mockImplementation((url) => {
                if (url === urlfactory) {
                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve(mockResponsefactory),
                    } as any)
                }
                return Promise.reject(new Error('Unknown URL'))
            })

        initFactory(model, bal, state)

        // Wait for the promise in initFactory to resolve
        await new Promise((resolve) => setTimeout(resolve, 0))

        expect(globalFetch).toHaveBeenCalledWith(urlfactory)
        expect(slv).toHaveBeenCalledWith({
            intBit: {
                idx: 'init-factory',
                dat: {
                    factory: mockResponsefactory,
                },
            },
        })

        globalFetch.mockRestore()
    })

    it('should handle fetch errors', async () => {
        const model = new FactoryModel()
        const state = {} as any
        const slv = vi.fn()
        const bal = { idx: 'test', slv } as any

        const urlfactory =
            'https://zero00-factory.onrender.com/api/factory/test'

        const errorMessage = 'Network error'
        const globalFetch = vi
            .spyOn(global, 'fetch')
            .mockImplementation((url) => {
                if (url === urlfactory) {
                    return Promise.reject(new Error(errorMessage))
                }
                return Promise.resolve({
                    ok: true,
                    json: async () => ({}),
                } as any)
            })

        initFactory(model, bal, state)

        // Wait for the promise in initFactory to resolve
        await new Promise((resolve) => setTimeout(resolve, 0))

        expect(globalFetch).toHaveBeenCalledWith(urlfactory)

        expect(slv).toHaveBeenCalledWith({
            intBit: { idx: 'init-factory-err', dat: errorMessage },
        })

        globalFetch.mockRestore()
    })
})
