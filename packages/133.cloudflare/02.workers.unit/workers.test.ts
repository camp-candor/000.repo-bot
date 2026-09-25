import { describe, it, expect, vi } from 'vitest'
import {
    initWorkers,
    updateWorkers,
    deleteWorkers,
    listWorkers,
} from './buz/workers.buzz.js'
import { WorkersModel } from './workers.model.js'

describe('workers', () => {
    it('should initialize workers', () => {
        const model = new WorkersModel()
        const state = {
            hunt: vi.fn().mockResolvedValue({}),
            dispatch: vi.fn(),
        } as any

        const slv = vi.fn()
        const bal = { idx: 'test', slv } as any

        expect(typeof initWorkers).toBe('function')

        const result = initWorkers(model, bal, state)
        expect(result).toBe(model)
    })

    it('should update workers', () => {
        const model = new WorkersModel()
        const state = {} as any
        const slv = vi.fn()
        const bal = { idx: 'test', slv } as any

        const result = updateWorkers(model, bal, state)
        expect(result).toBe(model)
        expect(slv).toHaveBeenCalledWith({ wrkBit: { idx: 'update-workers' } })
    })

    it('should delete workers', async () => {
        const model = new WorkersModel()
        const state = {
            hunt: vi.fn().mockResolvedValue({}),
        } as any
        const slv = vi.fn()
        const bal = { idx: 'test', slv } as any

        // mock fetch
        global.fetch = vi.fn().mockResolvedValue({
            json: () => Promise.resolve({ success: true, result: {} }),
        })

        // Set dummy env variables to avoid failing early
        process.env.CLOUDFLARE_ACCOUNT = 'test-account'
        process.env.CLOUDFLARE_WORKERS_TOKEN = 'test-token'

        const result = await deleteWorkers(model, bal, state)
        expect(result).toBe(model)
        expect(slv).toHaveBeenCalledWith({
            wrkBit: {
                idx: 'delete-workers',
                dat: { success: true, result: {} },
            },
        })
    })

    it('should list workers', async () => {
        const model = new WorkersModel()
        const state = {
            hunt: vi.fn().mockResolvedValue({ clcBit: { lst: ['worker1'] } }),
        } as any
        const slv = vi.fn()
        const bal = { idx: 'test', slv } as any

        const result = await listWorkers(model, bal, state)
        expect(result).toBe(model)
        expect(slv).toHaveBeenCalledWith({
            wrkBit: { idx: 'list-workers', lst: ['worker1'] },
        })
    })
})
