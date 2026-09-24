import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
    registerWatchedRepo,
    listWatchedRepos,
} from '../00.github.unit/buz/github.buzz.js'
import { GithubModel } from '../00.github.unit/github.model.js'

describe('GitHub Terminal Deck: Watched Repo Automated Provisioning', () => {
    beforeEach(() => {
        vi.restoreAllMocks()
        ;(global as any).LIBRARY = { hunt: vi.fn().mockResolvedValue({}) }
        process.env.GITHUB_TOKEN = 'mock-gh-token'
        process.env.GH_WEBHOOK_SECRET = 'mock-secret'
    })

    it('Step 1 & 2: provisions GitHub webhook (201) and registers in edge DO (200)', async () => {
        const model = new GithubModel()
        const slv = vi.fn()

        let githubHookPayload: any = null
        let doPayload: any = null

        global.fetch = vi
            .fn()
            .mockImplementation(async (url: string, opts: any) => {
                if (
                    url.includes(
                        'api.github.com/repos/astro-kahn-it-com/001.goblin-lore/hooks',
                    )
                ) {
                    githubHookPayload = JSON.parse(opts.body)
                    return {
                        status: 201,
                        json: async () => ({ id: 998877, active: true }),
                    }
                }
                if (url.includes('/repos')) {
                    doPayload = JSON.parse(opts.body)
                    return {
                        ok: true,
                        status: 200,
                        json: async () => ({
                            action: 'REPO_REGISTERED',
                            repo: {
                                id: 'astro-kahn-it-com/001.goblin-lore',
                                url: doPayload.url,
                            },
                        }),
                    }
                }
                return { ok: true, json: async () => ({}) }
            }) as any

        await registerWatchedRepo(
            model,
            {
                idx: 'register',
                src: 'https://github.com/astro-kahn-it-com/001.goblin-lore',
                slv,
            },
            {} as any,
        )

        expect(slv).toHaveBeenCalled()
        const result = slv.mock.calls[0][0]
        expect(result.gthBit.val).toBe(1)

        // Verify GitHub Webhook configuration payload
        expect(githubHookPayload).not.toBeNull()
        expect(githubHookPayload.events).toContain('pull_request')
        expect(githubHookPayload.events).toContain('push')
        expect(githubHookPayload.config.secret).toBe('mock-secret')

        // Verify DO payload
        expect(doPayload.url).toBe(
            'https://github.com/astro-kahn-it-com/001.goblin-lore',
        )
    })

    it('Idempotency: absorbs 422 hook already exists and registers in edge DO', async () => {
        const model = new GithubModel()
        const slv = vi.fn()

        global.fetch = vi.fn().mockImplementation(async (url: string) => {
            if (url.includes('api.github.com')) {
                return {
                    status: 422,
                    json: async () => ({
                        message: 'Validation Failed',
                        errors: [
                            {
                                message:
                                    'Hook already exists on this repository',
                            },
                        ],
                    }),
                }
            }
            return {
                ok: true,
                status: 200,
                json: async () => ({
                    action: 'REPO_REGISTERED',
                    repo: { id: 'astro-kahn-it-com/000.worker-sower-engine' },
                }),
            }
        }) as any

        await registerWatchedRepo(
            model,
            {
                idx: 'register',
                src: 'astro-kahn-it-com/000.worker-sower-engine',
                slv,
            },
            {} as any,
        )

        expect(slv).toHaveBeenCalled()
        const result = slv.mock.calls[0][0]
        expect(result.gthBit.val).toBe(1)
        expect(result.gthBit.dat.hookCreated).toBe(true)
    })

    it('Rejects malformed repository slugs cleanly', async () => {
        const model = new GithubModel()
        const slv = vi.fn()

        await registerWatchedRepo(
            model,
            {
                idx: 'register',
                src: 'invalid-single-token',
                slv,
            },
            {} as any,
        )

        expect(slv).toHaveBeenCalled()
        const result = slv.mock.calls[0][0]
        expect(result.gthBit.val).toBe(0)
    })

    it('listWatchedRepos queries edge and prints active fleet', async () => {
        const model = new GithubModel()
        const slv = vi.fn()

        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => [
                {
                    id: 'camp-candor/000.repo-bot',
                    url: 'https://github.com/camp-candor/000.repo-bot',
                },
                {
                    id: 'astro-kahn-it-com/001.goblin-lore',
                    url: 'https://github.com/astro-kahn-it-com/001.goblin-lore',
                },
            ],
        }) as any

        await listWatchedRepos(model, { idx: 'list-repos', slv }, {} as any)

        expect(slv).toHaveBeenCalled()
        const result = slv.mock.calls[0][0]
        expect(result.gthBit.lst.length).toBe(2)
    })
})
