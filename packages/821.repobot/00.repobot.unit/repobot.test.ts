import { describe, it, expect, vi } from 'vitest'
import {
    initRepobot,
    updateRepobot,
    testRepobot,
    listRepobot,
    disconnectRepobot,
} from './buz/repobot.buzz.js'
import { RepobotModel } from './repobot.model.js'

describe('repobot unit', () => {
    it('should initialize repobot', () => {
        const model = new RepobotModel()
        const state = {} as any
        const slv = vi.fn()
        const bal = { idx: 'test', slv } as any

        expect(typeof initRepobot).toBe('function')

        const result = initRepobot(model, bal, state)
        expect(result).toBe(model)
        expect(slv).toHaveBeenCalledWith({ intBit: { idx: 'init-repobot' } })
    })

    it('should update repobot', () => {
        const model = new RepobotModel()
        const state = {} as any
        const slv = vi.fn()
        const bal = { idx: 'test-update', slv } as any

        const result = updateRepobot(model, bal, state)
        expect(result).toBe(model)
        expect(slv).toHaveBeenCalledWith({ intBit: { idx: 'update-repobot' } })
    })

    it('should test repobot by fetching commit and check runs from worker', async () => {
        const model = new RepobotModel()
        const state = {} as any
        const slv = vi.fn()
        const bal = { idx: 'test-ping', slv } as any

        const mockInspectData = {
            commit: {
                sha: '1234567890abcdef',
                message: 'feat: add repobot',
                author: 'Brad Henderson',
                timestamp: '2026-09-21T21:00:00Z',
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

        const result = await testRepobot(model, bal, state)
        expect(result).toBe(model)
        expect(slv).toHaveBeenCalledWith({
            mytBit: { idx: 'test-repobot', val: 1, dat: mockInspectData },
        })

        globalFetch.mockRestore()
    })

    it('should list repobot models', async () => {
        const model = new RepobotModel()
        const state = {} as any
        const slv = vi.fn()
        const bal = { idx: 'list-all', slv } as any

        const result = await listRepobot(model, bal, state)
        expect(result).toBe(model)
        expect(slv).toHaveBeenCalledWith({
            olmBit: {
                idx: 'list-repobot',
                lst: [],
            },
        })
    })

    it('should disconnect repobot', () => {
        const model = new RepobotModel()
        const state = {} as any
        const slv = vi.fn()
        const bal = { idx: 'disconnect', slv } as any

        const result = disconnectRepobot(model, bal, state)
        expect(result).toBe(model)
        expect(slv).toHaveBeenCalledWith({
            olmBit: { idx: 'disconnect-repobot', lst: [] },
        })
    })
})
