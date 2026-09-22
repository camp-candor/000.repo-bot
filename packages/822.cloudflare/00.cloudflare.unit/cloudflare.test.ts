import { describe, it, expect, vi } from 'vitest'
import {
    initCloudflare,
    updateCloudflare,
    testCloudflare,
    listCloudflare,
    disconnectCloudflare,
} from './buz/cloudflare.buzz.js'
import { CloudflareModel } from './cloudflare.model.js'

describe('cloudflare unit', () => {
    it('should initialize cloudflare', () => {
        const model = new CloudflareModel()
        const state = {} as any
        const slv = vi.fn()
        const bal = { idx: 'test', slv } as any

        expect(typeof initCloudflare).toBe('function')

        const result = initCloudflare(model, bal, state)
        expect(result).toBe(model)
        expect(slv).toHaveBeenCalledWith({ intBit: { idx: 'init-cloudflare' } })
    })

    it('should update cloudflare', () => {
        const model = new CloudflareModel()
        const state = {} as any
        const slv = vi.fn()
        const bal = { idx: 'test-update', slv } as any

        const result = updateCloudflare(model, bal, state)
        expect(result).toBe(model)
        expect(slv).toHaveBeenCalledWith({
            intBit: { idx: 'update-cloudflare' },
        })
    })

    it('should test cloudflare by fetching commit and check runs from worker', async () => {
        const model = new CloudflareModel()
        const state = {} as any
        const slv = vi.fn()
        const bal = { idx: 'test-ping', slv } as any

        const mockInspectData = {
            commit: {
                sha: '1234567890abcdef',
                message: 'feat: add cloudflare',
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

        const result = await testCloudflare(model, bal, state)
        expect(result).toBe(model)
        expect(slv).toHaveBeenCalledWith({
            mytBit: { idx: 'test-cloudflare', val: 1, dat: mockInspectData },
        })

        globalFetch.mockRestore()
    })

    it('should list cloudflare models', async () => {
        const model = new CloudflareModel()
        const state = {} as any
        const slv = vi.fn()
        const bal = { idx: 'list-all', slv } as any

        const result = await listCloudflare(model, bal, state)
        expect(result).toBe(model)
        expect(slv).toHaveBeenCalledWith({
            olmBit: {
                idx: 'list-cloudflare',
                lst: [],
            },
        })
    })

    it('should disconnect cloudflare', () => {
        const model = new CloudflareModel()
        const state = {} as any
        const slv = vi.fn()
        const bal = { idx: 'disconnect', slv } as any

        const result = disconnectCloudflare(model, bal, state)
        expect(result).toBe(model)
        expect(slv).toHaveBeenCalledWith({
            olmBit: { idx: 'disconnect-cloudflare', lst: [] },
        })
    })
})
