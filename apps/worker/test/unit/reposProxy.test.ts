import { describe, it, expect, vi } from 'vitest'
import app from '../../src/index.js'

describe('Worker Edge Ingress: /repos Route Proxying', () => {
    it('proxies POST /repos to the global RepoBotDO stub', async () => {
        const mockStubFetch = vi.fn().mockResolvedValue(
            new Response(
                JSON.stringify({
                    action: 'REPO_REGISTERED',
                    repo: {
                        id: 'astro-kahn-it-com/001.goblin-lore',
                        url: 'https://github.com/astro-kahn-it-com/001.goblin-lore',
                    },
                }),
                {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                },
            ),
        )

        const mockEnv = {
            REPO_BOT_DO: {
                idFromName: vi.fn().mockReturnValue('mock-global-id'),
                get: vi.fn().mockReturnValue({ fetch: mockStubFetch }),
            },
        }

        const req = new Request('http://localhost/repos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: 'https://github.com/astro-kahn-it-com/001.goblin-lore',
            }),
        })

        const res = await app.fetch(req, mockEnv as any)
        expect(res.status).toBe(200)

        const body: any = await res.json()
        expect(body.action).toBe('REPO_REGISTERED')
        expect(mockStubFetch).toHaveBeenCalled()
    })

    it('proxies GET /repos to the global RepoBotDO stub', async () => {
        const mockStubFetch = vi.fn().mockResolvedValue(
            new Response(JSON.stringify([{ id: 'camp-candor/000.repo-bot' }]), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }),
        )

        const mockEnv = {
            REPO_BOT_DO: {
                idFromName: vi.fn().mockReturnValue('mock-global-id'),
                get: vi.fn().mockReturnValue({ fetch: mockStubFetch }),
            },
        }

        const req = new Request('http://localhost/repos', { method: 'GET' })
        const res = await app.fetch(req, mockEnv as any)
        expect(res.status).toBe(200)

        const body: any = await res.json()
        expect(Array.isArray(body)).toBe(true)
        expect(mockStubFetch).toHaveBeenCalled()
    })

    it('proxies GET /api/slack/status to the global RepoBotDO stub', async () => {
        const mockStubFetch = vi.fn().mockResolvedValue(
            new Response(
                JSON.stringify({ ok: true, configuredChannel: 'C0C40FMRQ9H' }),
                {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                },
            ),
        )

        const mockEnv = {
            REPO_BOT_DO: {
                idFromName: vi.fn().mockReturnValue('mock-global-id'),
                get: vi.fn().mockReturnValue({ fetch: mockStubFetch }),
            },
        }

        const req = new Request('http://localhost/api/slack/status', {
            method: 'GET',
        })
        const res = await app.fetch(req, mockEnv as any)
        expect(res.status).toBe(200)

        const body: any = await res.json()
        expect(body.configuredChannel).toBe('C0C40FMRQ9H')
    })
})
