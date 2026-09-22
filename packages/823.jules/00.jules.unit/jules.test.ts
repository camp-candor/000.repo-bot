import { describe, it, expect, vi } from 'vitest'
import {
    initJules,
    updateJules,
    testJules,
    listJules,
    disconnectJules,
} from './buz/jules.buzz.js'
import { JulesModel } from './jules.model.js'

describe('jules unit', () => {
    it('should initialize jules', () => {
        const model = new JulesModel()
        const state = {} as any
        const slv = vi.fn()
        const bal = { idx: 'test', slv } as any

        expect(typeof initJules).toBe('function')

        const result = initJules(model, bal, state)
        expect(result).toBe(model)
        expect(slv).toHaveBeenCalledWith({ intBit: { idx: 'init-jules' } })
    })

    it('should update jules', () => {
        const model = new JulesModel()
        const state = {} as any
        const slv = vi.fn()
        const bal = { idx: 'test-update', slv } as any

        const result = updateJules(model, bal, state)
        expect(result).toBe(model)
        expect(slv).toHaveBeenCalledWith({
            intBit: { idx: 'update-jules' },
        })
    })

    it('should test jules by fetching commit and check runs from worker', async () => {
        const model = new JulesModel()
        const state = {} as any
        const slv = vi.fn()
        const bal = { idx: 'test-ping', slv } as any

        const mockInspectData = {
            commit: {
                sha: '1234567890abcdef',
                message: 'feat: add jules',
                author: 'Brad Henderson',
                timestamp: '2026-09-22T08:00:00Z',
            },
            checks: {
                all_passed: true,
                total_count: 1,
                status: 'completed',
                runs: [
                    {
                        name: 'test',
                        status: 'completed',
                        conclusion: 'success',
                        details_url: 'https://github.com/ci/1',
                    },
                ],
            },
        }

        const globalFetch = vi.spyOn(global, 'fetch').mockImplementation(() =>
            Promise.resolve({
                ok: true,
                json: async () => mockInspectData,
            } as any),
        )

        const result = await testJules(model, bal, state)
        expect(result).toBe(model)
        expect(slv).toHaveBeenCalledWith({
            mytBit: { idx: 'test-jules', val: 1, dat: mockInspectData },
        })

        globalFetch.mockRestore()
    })

    it('should list jules models', async () => {
        const model = new JulesModel()
        const state = {} as any
        const slv = vi.fn()
        const bal = { idx: 'list-all', slv } as any

        const result = await listJules(model, bal, state)
        expect(result).toBe(model)
        expect(slv).toHaveBeenCalledWith({
            olmBit: {
                idx: 'list-jules',
                lst: [],
            },
        })
    })

    it('should disconnect jules', () => {
        const model = new JulesModel()
        const state = {} as any
        const slv = vi.fn()
        const bal = { idx: 'disconnect', slv } as any

        const result = disconnectJules(model, bal, state)
        expect(result).toBe(model)
        expect(slv).toHaveBeenCalledWith({
            olmBit: { idx: 'disconnect-jules', lst: [] },
        })
    })
})
