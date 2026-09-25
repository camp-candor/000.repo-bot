import { describe, it, expect, vi } from 'vitest'
import {
    initCloudflare,
    updateCloudflare,
    testCloudflare,
    listCloudflare,
    projectCloudflare,
} from './buz/cloudflare.buzz.js'
import { CloudflareModel } from './cloudflare.model.js'

describe('cloudflare', () => {
    it('should initialize cloudflare', async () => {
        const model = new CloudflareModel()
        const state = {
            hunt: vi.fn().mockResolvedValue({
                cflBit: { dat: { workers: [], pages: [] } },
            }),
            dispatch: vi.fn(),
        } as any

        const slv = vi.fn()
        const bal = { idx: 'test', slv } as any

        expect(typeof initCloudflare).toBe('function')

        const result = await initCloudflare(model, bal, state)
        expect(result).toBe(model)
        expect(slv).toHaveBeenCalledWith({ intBit: { idx: 'init-cloudflare' } })
    })

    it('should update cloudflare', () => {
        const model = new CloudflareModel()
        const state = {} as any
        const slv = vi.fn()
        const bal = { idx: 'test', slv } as any

        const result = updateCloudflare(model, bal, state)
        expect(result).toBe(model)
        expect(slv).toHaveBeenCalledWith({
            intBit: { idx: 'update-cloudflare' },
        })
    })

    it('should test cloudflare', () => {
        const model = new CloudflareModel()
        const state = {} as any
        const slv = vi.fn()
        const bal = { idx: 'test', slv } as any

        const result = testCloudflare(model, bal, state)
        expect(result).toBe(model)
        expect(slv).toHaveBeenCalledWith({
            mytBit: { idx: 'test-cloudflare', val: 1 },
        })
    })

    it('should list cloudflare', async () => {
        const model = new CloudflareModel()
        const state = {} as any
        const slv = vi.fn()
        const bal = { idx: 'test', slv } as any

        const result = await listCloudflare(model, bal, state)
        expect(result).toBe(model)
        expect(slv).toHaveBeenCalledWith({
            cflBit: {
                idx: 'list-cloudflare',
                lst: ['cloudflare-page-1', 'cloudflare-worker-1'],
            },
        })
    })

    it('should project cloudflare', async () => {
        const originalEnv = process.env
        process.env = {
            ...originalEnv,
            CLOUDFLARE_ACCOUNT: 'test-account-id',
            CLOUDFLARE_WORKERS_TOKEN: 'test-api-token',
        }

        const mockFetch = vi.fn().mockImplementation((url: string) => {
            if (url.includes('workers/scripts')) {
                return Promise.resolve({
                    json: () =>
                        Promise.resolve({ result: ['worker-1', 'worker-2'] }),
                })
            }
            if (url.includes('pages/projects')) {
                return Promise.resolve({
                    json: () =>
                        Promise.resolve({
                            result: ['page-project-1', 'page-project-2'],
                        }),
                })
            }
            return Promise.reject(new Error('Unknown URL'))
        })

        global.fetch = mockFetch as any

        const model = new CloudflareModel()
        const state = {} as any
        const slv = vi.fn()
        const bal = { idx: 'test', slv } as any

        const result = await projectCloudflare(model, bal, state)

        expect(result).toBe(model)
        expect(mockFetch).toHaveBeenCalledTimes(2)
        expect(mockFetch).toHaveBeenCalledWith(
            'https://api.cloudflare.com/client/v4/accounts/test-account-id/workers/scripts',
            expect.any(Object),
        )
        expect(mockFetch).toHaveBeenCalledWith(
            'https://api.cloudflare.com/client/v4/accounts/test-account-id/pages/projects',
            expect.any(Object),
        )

        expect(slv).toHaveBeenCalledWith({
            cflBit: {
                idx: 'project-cloudflare',
                dat: {
                    workers: ['worker-1', 'worker-2'],
                    pages: ['page-project-1', 'page-project-2'],
                },
            },
        })

        process.env = originalEnv
    })

    it('should handle missing credentials in projectCloudflare gracefully', async () => {
        const originalEnv = process.env
        process.env = {
            ...originalEnv,
            CLOUDFLARE_ACCOUNT: '',
            CLOUDFLARE_WORKERS_TOKEN: '',
        }

        const model = new CloudflareModel()
        const state = {} as any
        const slv = vi.fn()
        const bal = { idx: 'test-missing', slv } as any

        const result = await projectCloudflare(model, bal, state)

        expect(result).toBe(model)
        expect(slv).toHaveBeenCalledWith({
            cflBit: {
                idx: 'project-cloudflare',
                dat: { workers: [], pages: [] },
                lst: { workers: [], pages: [] },
                err: 'Missing credentials',
            },
        })

        process.env = originalEnv
    })
})
