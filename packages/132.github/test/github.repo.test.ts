import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
    registerWatchedRepo,
    listWatchedRepos,
    auditGithubToken,
    checkSlackBridgeStatus,
    logConsole,
    parseSafeResponse,
} from '../00.github.unit/buz/github.buzz.js'
import { GithubModel } from '../00.github.unit/github.model.js'

describe('GitHub Terminal Deck: Watched Repo Automated Provisioning', () => {
    beforeEach(() => {
        vi.restoreAllMocks()
        ;(global as any).LIBRARY = { hunt: vi.fn().mockResolvedValue({}) }
        process.env.GITHUB_TOKEN = 'mock-gh-token'
        process.env.GH_WEBHOOK_SECRET = 'mock-secret'
    })

    it('Step 1, 2 & 3: provisions GitHub webhook (201), registers in edge DO (200), and pings webhook (204)', async () => {
        const model = new GithubModel()
        const slv = vi.fn()

        let githubHookPayload: any = null
        let doPayload: any = null
        let pingDispatched = false

        global.fetch = vi
            .fn()
            .mockImplementation(async (url: string, opts: any) => {
                if (url.includes('/pings')) {
                    pingDispatched = true
                    return {
                        ok: true,
                        status: 204,
                        text: async () => '',
                        json: async () => ({}),
                    }
                }
                if (
                    url.includes(
                        'api.github.com/repos/astro-kahn-it-com/001.goblin-lore/hooks',
                    )
                ) {
                    githubHookPayload = JSON.parse(opts.body)
                    return {
                        ok: true,
                        status: 201,
                        text: async () =>
                            JSON.stringify({ id: 998877, active: true }),
                        json: async () => ({ id: 998877, active: true }),
                    }
                }
                if (url.includes('/repos')) {
                    doPayload = JSON.parse(opts.body)
                    return {
                        ok: true,
                        status: 200,
                        text: async () =>
                            JSON.stringify({
                                action: 'REPO_REGISTERED',
                                repo: {
                                    id: 'astro-kahn-it-com/001.goblin-lore',
                                    url: doPayload.url,
                                },
                            }),
                        json: async () => ({
                            action: 'REPO_REGISTERED',
                            repo: {
                                id: 'astro-kahn-it-com/001.goblin-lore',
                                url: doPayload.url,
                            },
                        }),
                    }
                }
                return {
                    ok: true,
                    status: 200,
                    text: async () => '{}',
                    json: async () => ({}),
                }
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

        // Verify Step 3: instant ping dispatched
        expect(pingDispatched).toBe(true)
    })

    it('Idempotency: absorbs 422 hook already exists and registers in edge DO', async () => {
        const model = new GithubModel()
        const slv = vi.fn()

        global.fetch = vi.fn().mockImplementation(async (url: string) => {
            if (url.includes('api.github.com')) {
                return {
                    ok: false,
                    status: 422,
                    text: async () =>
                        JSON.stringify({
                            message: 'Validation Failed',
                            errors: [
                                {
                                    message:
                                        'Hook already exists on this repository',
                                },
                            ],
                        }),
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
                text: async () =>
                    JSON.stringify({
                        action: 'REPO_REGISTERED',
                        repo: {
                            id: 'astro-kahn-it-com/000.worker-sower-engine',
                        },
                    }),
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

        const mockRepos = [
            {
                id: 'camp-candor/000.repo-bot',
                url: 'https://github.com/camp-candor/000.repo-bot',
            },
            {
                id: 'astro-kahn-it-com/001.goblin-lore',
                url: 'https://github.com/astro-kahn-it-com/001.goblin-lore',
            },
        ]

        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            text: async () => JSON.stringify(mockRepos),
            json: async () => mockRepos,
        }) as any

        await listWatchedRepos(model, { idx: 'list-repos', slv }, {} as any)

        expect(slv).toHaveBeenCalled()
        const result = slv.mock.calls[0][0]
        expect(result.gthBit.lst.length).toBe(2)
    })

    it('checkSlackBridgeStatus queries edge status and reports delivery telemetry', async () => {
        const model = new GithubModel()
        const slv = vi.fn()

        const mockTelemetry = {
            ok: true,
            configuredChannel: 'C0C40FMRQ9H',
            hasBotToken: true,
            lastDelivery: {
                timestamp: 1727200000000,
                channel: 'C0C40FMRQ9H',
                event: 'MERGE_ANNOUNCEMENT',
                ok: true,
                ts: '1727200000.1234',
            },
            serverTime: 1727200001000,
        }

        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            text: async () => JSON.stringify(mockTelemetry),
            json: async () => mockTelemetry,
        }) as any

        await checkSlackBridgeStatus(
            model,
            { idx: 'check-slack', slv },
            {} as any,
        )

        expect(slv).toHaveBeenCalled()
        const result = slv.mock.calls[0][0]
        expect(result.gthBit.val).toBe(1)
        expect(result.gthBit.dat.configuredChannel).toBe('C0C40FMRQ9H')
    })

    it('logConsole breaks long lines gracefully into wrapped lines', async () => {
        const huntMock = vi.fn().mockResolvedValue({})
        ;(global as any).LIBRARY = { hunt: huntMock }

        const longMsg =
            '>> This is an extremely long log message designed to exceed the maximum console column limit of fifty-six characters to verify soft wrapping'
        await logConsole(longMsg, 50)

        expect(huntMock).toHaveBeenCalled()
        expect(huntMock.mock.calls.length).toBeGreaterThan(1)
        expect(huntMock.mock.calls[1][1].src).toMatch(/^>>\s{4}/)
    })

    it('parseSafeResponse safely handles plain text 404 without throwing SyntaxError', async () => {
        const mockResponse = new Response('404 Not Found', {
            status: 404,
            statusText: 'Not Found',
        })
        const parsed = await parseSafeResponse(mockResponse)

        expect(parsed.ok).toBe(false)
        expect(parsed.status).toBe(404)
        expect(parsed.data).toBeNull()
        expect(parsed.raw).toBe('404 Not Found')
    })

    it('auditGithubToken inspects user identity, scopes, and repository permissions', async () => {
        const model = new GithubModel()
        const slv = vi.fn()

        global.fetch = vi.fn().mockImplementation(async (url: string) => {
            if (url.includes('/user')) {
                return new Response(
                    JSON.stringify({ login: 'elliotbradly', id: 12345 }),
                    {
                        status: 200,
                        headers: { 'x-oauth-scopes': 'repo, admin:repo_hook' },
                    },
                )
            }
            if (url.includes('/repos/')) {
                return new Response(
                    JSON.stringify({
                        private: true,
                        default_branch: 'main',
                        permissions: { pull: true, push: true, admin: true },
                    }),
                    { status: 200 },
                )
            }
            return new Response('{}', { status: 200 })
        }) as any

        await auditGithubToken(
            model,
            { idx: 'audit', src: 'camp-candor/000.repo-bot', slv },
            {} as any,
        )

        expect(slv).toHaveBeenCalled()
        const result = slv.mock.calls[0][0]
        expect(result.gthBit.val).toBe(1)
        expect(result.gthBit.dat.user).toBe('elliotbradly')
        expect(result.gthBit.dat.scopes).toContain('admin:repo_hook')
        expect(result.gthBit.dat.permissions.admin).toBe(true)
    })

    it('auditGithubToken normalizes full GitHub URLs into clean repository slugs', async () => {
        const model = new GithubModel()
        const slv = vi.fn()
        let queriedRepoEndpoint = ''

        global.fetch = vi.fn().mockImplementation(async (url: string) => {
            if (url.includes('/user')) {
                return new Response(
                    JSON.stringify({ login: 'elliotbradly', id: 12345 }),
                    {
                        status: 200,
                        headers: { 'x-oauth-scopes': 'repo, admin:repo_hook' },
                    },
                )
            }
            if (url.includes('/repos/')) {
                queriedRepoEndpoint = url
                return new Response(
                    JSON.stringify({
                        private: true,
                        default_branch: 'main',
                        permissions: { pull: true, push: true, admin: true },
                    }),
                    { status: 200 },
                )
            }
            return new Response('{}', { status: 200 })
        }) as any

        await auditGithubToken(
            model,
            {
                idx: 'audit',
                src: 'https://github.com/astro-kahn-it-com/000.astrokahn.git',
                slv,
            },
            {} as any,
        )

        expect(slv).toHaveBeenCalled()
        const result = slv.mock.calls[0][0]
        expect(result.gthBit.val).toBe(1)
        expect(result.gthBit.dat.repoSlug).toBe(
            'astro-kahn-it-com/000.astrokahn',
        )
        expect(queriedRepoEndpoint).toBe(
            'https://api.github.com/repos/astro-kahn-it-com/000.astrokahn',
        )
    })
})
