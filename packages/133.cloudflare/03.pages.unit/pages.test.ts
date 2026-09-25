import { describe, it, expect, vi } from 'vitest'
import { initPages, updatePages, deletePages } from './buz/pages.buzz.js'
import { PagesModel } from './pages.model.js'

describe('pages', () => {
    it('should initialize pages', () => {
        const model = new PagesModel()
        const state = {
            hunt: vi.fn().mockResolvedValue({}),
            dispatch: vi.fn(),
        } as any

        const slv = vi.fn()
        const bal = { idx: 'test', slv } as any

        expect(typeof initPages).toBe('function')

        const result = initPages(model, bal, state)
        expect(result).toBe(model)
    })

    it('should update pages', () => {
        const model = new PagesModel()
        const state = {} as any
        const slv = vi.fn()
        const bal = { idx: 'test', slv } as any

        const result = updatePages(model, bal, state)
        expect(result).toBe(model)
        expect(slv).toHaveBeenCalledWith({ pgsBit: { idx: 'update-pages' } })
    })

    it('should delete pages', async () => {
        const model = new PagesModel()
        const state = {} as any
        const slv = vi.fn()
        const bal = { idx: 'test', slv } as any

        const result = await deletePages(model, bal, state)
        expect(result).toBe(model)
        // Note: It's checking for missing credentials now.
        expect(slv).toHaveBeenCalledWith({
            pgsBit: {
                idx: 'delete-pages',
                dat: { err: 'Missing credentials or ID' },
            },
        })
    })
})
