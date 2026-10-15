import { describe, it, expect, vi } from 'vitest'
import { initPivot } from './buz/pivot.buzz.js'
import { PivotModel } from './pivot.model.js'

describe('pivot', () => {
    it('should initialize pivot', () => {
        const model = new PivotModel()
        const state = {
            hunt: vi.fn().mockResolvedValue({}),
            dispatch: vi.fn(),
        } as any

        const slv = vi.fn()
        const bal = { idx: 'test', slv } as any

        // Check if initPivot is a function and can be called
        expect(typeof initPivot).toBe('function')

        const result = initPivot(model, bal, state)
        expect(result).toBe(model)
        //expect(slv).toHaveBeenCalledWith({ intBit: { idx: 'init-pivot' } });
    })

    it('should wake up the pivot if url is provided', async () => {
        const model = new PivotModel()
        const state = {} as any
        const slv = vi.fn()
        const bal = { idx: 'test', slv } as any

        const urlpivot = 'https://zero00-pivot.onrender.com/api/pivot/test'

        const mockResponsepivot = { status: 'pivot-awake' }

        const globalFetch = vi
            .spyOn(global, 'fetch')
            .mockImplementation((url) => {
                if (url === urlpivot) {
                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve(mockResponsepivot),
                    } as any)
                }
                return Promise.reject(new Error('Unknown URL'))
            })

        initPivot(model, bal, state)

        // Wait for the promise in initPivot to resolve
        await new Promise((resolve) => setTimeout(resolve, 0))

        expect(globalFetch).toHaveBeenCalledWith(urlpivot)
        expect(slv).toHaveBeenCalledWith({
            intBit: {
                idx: 'init-pivot',
                dat: {
                    pivot: mockResponsepivot,
                },
            },
        })

        globalFetch.mockRestore()
    })

    it('should handle fetch errors', async () => {
        const model = new PivotModel()
        const state = {} as any
        const slv = vi.fn()
        const bal = { idx: 'test', slv } as any

        const urlpivot = 'https://zero00-pivot.onrender.com/api/pivot/test'

        const errorMessage = 'Network error'
        const globalFetch = vi
            .spyOn(global, 'fetch')
            .mockImplementation((url) => {
                if (url === urlpivot) {
                    return Promise.reject(new Error(errorMessage))
                }
                return Promise.resolve({
                    ok: true,
                    json: async () => ({}),
                } as any)
            })

        initPivot(model, bal, state)

        // Wait for the promise in initPivot to resolve
        await new Promise((resolve) => setTimeout(resolve, 0))

        expect(globalFetch).toHaveBeenCalledWith(urlpivot)

        expect(slv).toHaveBeenCalledWith({
            intBit: { idx: 'init-pivot-err', dat: errorMessage },
        })

        globalFetch.mockRestore()
    })
})
