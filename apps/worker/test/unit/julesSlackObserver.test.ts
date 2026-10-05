import { describe, it, expect, vi, afterEach } from 'vitest'
import app from '../../src/index.js'
import {
    buildJulesStatusCard,
    postSlackMergeAnnouncement,
} from '../../src/slackBridge.js'
import { resolveJulesSource, buildSystemInstructions } from '../../src/jules.js'
import {
    normalizeDirectivePrompt,
    extractDirectivePath,
} from '../../src/routes/slackEvents.js'
import { handleSlackInteraction } from '../../src/routes/slackInteractions.js'

describe('Jules Slack Observer Card Colors & Button Architecture', () => {
    const mockEnv = {
        SLACK_JULES_CHANNEL_ID: 'C0C4CK27LA1',
        SLACK_CHANNEL_ID: 'C0C40FMRQ9H',
    }

    it('builds READY_FOR_REVIEW card with Emerald Green (#2EB886) attachment bar', () => {
        const card = buildJulesStatusCard(
            {
                sessionId: 'session_abc123',
                repo: 'slopratchet/000.alligator.ink',
                taskId: 'feat/history-007-dossier',
                status: 'READY_FOR_REVIEW',
                prUrl: 'https://github.com/slopratchet/000.alligator.ink/pull/14',
                branchName: 'feat/history-007-dossier',
                queryText:
                    'Generates structured JSON dossier for history collection.',
            },
            mockEnv,
        )

        expect(card).not.toBeNull()
        expect(card!.channel).toBe('C0C4CK27LA1')
        expect(card!.attachments).toBeDefined()
        expect(card!.attachments[0].color).toBe('#2EB886')

        const actionBlock = card!.attachments[0].blocks.find(
            (b: any) => b.type === 'actions',
        )
        expect(actionBlock).toBeDefined()

        const prButton = actionBlock.elements.find(
            (el: any) =>
                el.url ===
                'https://github.com/slopratchet/000.alligator.ink/pull/14',
        )
        expect(prButton).toBeDefined()
        expect(prButton.text.text).toBe('View Pull Request [GitHub]')
        expect(prButton.action_id).toBeUndefined() // Verified clean link button (zero backend overhead)

        const dismissBtn = actionBlock.elements.find(
            (el: any) => el.action_id === 'jules_dismiss_card',
        )
        expect(dismissBtn).toBeDefined()
        expect(dismissBtn.text.text).toBe('Dismiss Card')
        expect(dismissBtn.style).toBe('danger')
        expect(JSON.parse(dismissBtn.value)).toEqual({
            action: 'dismiss',
            repo: 'slopratchet/000.alligator.ink',
            sessionId: 'session_abc123',
        })
    })

    it('returns null for MERGED status to suppress redundant card generation', () => {
        const card = buildJulesStatusCard(
            {
                sessionId: 'session_abc123',
                repo: 'camp-candor/000.repo-bot',
                taskId: 'bump-version-5040221361492999795',
                status: 'MERGED',
                prUrl: 'https://github.com/camp-candor/000.repo-bot/pull/83',
                branchName: 'bump-version-5040221361492999795',
                queryText: 'Merged into main by elliotbradly.',
            },
            mockEnv,
        )

        expect(card).toBeNull()
    })

    it('builds INPUT_REQUIRED card with Amber Yellow (#ECB22E) attachment bar', () => {
        const card = buildJulesStatusCard(
            {
                sessionId: '13980471994167374037',
                repo: 'camp-candor/000.repo-bot',
                taskId: 'TASK-04.02',
                status: 'INPUT_REQUIRED',
                queryText: 'Does everything look correct so far?',
            },
            mockEnv,
        )

        expect(card).not.toBeNull()
        expect(card!.attachments[0].color).toBe('#ECB22E')
        const actionBlock = card!.attachments[0].blocks.find(
            (b: any) => b.type === 'actions',
        )
        const sessionButton = actionBlock.elements.find((el: any) =>
            el.url.includes('13980471994167374037'),
        )
        expect(sessionButton.text.text).toContain('Open Session in Jules')

        const dismissBtn = actionBlock.elements.find(
            (el: any) => el.action_id === 'jules_dismiss_card',
        )
        expect(dismissBtn).toBeDefined()
        expect(dismissBtn.text.text).toBe('Dismiss Card')
        expect(dismissBtn.style).toBe('danger')
        expect(JSON.parse(dismissBtn.value)).toEqual({
            action: 'dismiss',
            repo: 'camp-candor/000.repo-bot',
            sessionId: '13980471994167374037',
        })
    })
})

describe('resolveJulesSource Dynamic Entity Resolution', () => {
    const originalFetch = globalThis.fetch

    afterEach(() => {
        globalThis.fetch = originalFetch
    })

    it('resolves canonical source matching githubRepo owner and repo', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                sources: [
                    {
                        name: 'sources/github/camp-candor/000.repo-bot',
                        id: 'github/camp-candor/000.repo-bot',
                        githubRepo: {
                            owner: 'camp-candor',
                            repo: '000.repo-bot',
                        },
                    },
                ],
            }),
        } as any)

        const sourceName = await resolveJulesSource(
            'camp-candor',
            '000.repo-bot',
            'test-api-key',
        )
        expect(sourceName).toBe('sources/github/camp-candor/000.repo-bot')
        expect(globalThis.fetch).toHaveBeenCalledWith(
            'https://jules.googleapis.com/v1alpha/sources',
            expect.objectContaining({
                headers: {
                    'x-goog-api-key': 'test-api-key',
                    'Content-Type': 'application/json',
                },
            }),
        )
    })

    it('resolves canonical source matching githubRepoContext or github', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                sources: [
                    {
                        name: 'sources/98765',
                        githubRepoContext: {
                            owner: 'camp-candor',
                            repo: '000.repo-bot',
                        },
                    },
                ],
            }),
        } as any)

        const sourceName = await resolveJulesSource(
            'camp-candor',
            '000.repo-bot',
            'test-api-key',
        )
        expect(sourceName).toBe('sources/98765')
    })

    it('resolves canonical source matching id or source name segment', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                sources: [
                    {
                        name: 'sources/github/camp-candor/995.library',
                        id: 'github/camp-candor/995.library',
                    },
                ],
            }),
        } as any)

        const sourceName = await resolveJulesSource(
            'camp-candor',
            '995.library',
            'test-api-key',
        )
        expect(sourceName).toBe('sources/github/camp-candor/995.library')
    })

    it('throws fail-closed error with connected sources when repo is unmapped', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                sources: [
                    {
                        name: 'sources/github/camp-candor/995.library',
                        githubRepo: {
                            owner: 'camp-candor',
                            repo: '995.library',
                        },
                    },
                ],
            }),
        } as any)

        await expect(
            resolveJulesSource(
                'camp-candor',
                'unconnected-repo',
                'test-api-key',
            ),
        ).rejects.toThrow(
            /Repository 'camp-candor\/unconnected-repo' is not connected in Google Jules/,
        )
    })

    it('throws descriptive error when Jules API query fails', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 403,
            text: async () => 'API key invalid',
        } as any)

        await expect(
            resolveJulesSource('camp-candor', '000.repo-bot', 'bad-key'),
        ).rejects.toThrow(
            /Failed to query Jules sources \(403\): API key invalid/,
        )
    })
})

describe('Jules buildSystemInstructions Boundary Invariance', () => {
    it('enforces strict immutable runner boundary for standard repos', () => {
        const prompt = buildSystemInstructions(
            '000.repo-bot',
            ['package.json'],
            'spec/task-01-abcdef1',
        )
        expect(prompt).toContain('IMMUTABLE RUNNER BOUNDARY')
        expect(prompt).toContain(
            "Modifying ANY file inside 'apps/995.library/' is strictly prohibited.",
        )
        expect(prompt).not.toContain('REPOSITORY BOUNDARY')
    })

    it('exempts camp-candor/995.library from apps/995.library ban and applies repository boundary', () => {
        const prompt = buildSystemInstructions(
            'camp-candor/995.library',
            ['package.json'],
            'spec/task-02-1234567',
        )
        expect(prompt).not.toContain('IMMUTABLE RUNNER BOUNDARY')
        expect(prompt).toContain(
            "REPOSITORY BOUNDARY: You are operating directly on 'camp-candor/995.library'",
        )
        expect(prompt).toContain('Preserve root configuration and CI files')
    })
})

describe('normalizeDirectivePrompt auto-wrapping', () => {
    it('converts Windows backslash directive path', () => {
        expect(
            normalizeDirectivePrompt('data\\directive\\day-001\\000.jules.md'),
        ).toBe('execute [data/directive/day-001/000.jules.md]')
    })

    it('converts quoted directive path', () => {
        expect(
            normalizeDirectivePrompt('"data/directive/day-002/001.task.md"'),
        ).toBe('execute [data/directive/day-002/001.task.md]')
    })

    it('converts leading backslash directive path', () => {
        expect(
            normalizeDirectivePrompt('\\data\\directive\\day-003\\002.task.md'),
        ).toBe('execute [data/directive/day-003/002.task.md]')
    })

    it('does not double-wrap an already wrapped directive', () => {
        expect(
            normalizeDirectivePrompt(
                'execute [data\\directive\\day-001\\000.jules.md]',
            ),
        ).toBe('execute [data\\directive\\day-001\\000.jules.md]')
    })

    it('leaves standard prompts untouched', () => {
        expect(normalizeDirectivePrompt('bump main version')).toBe(
            'bump main version',
        )
    })
})

describe('jules_dismiss_card Slack interaction handler', () => {
    it('instructs Slack to delete the original card and posts delete_original to response_url', async () => {
        let executedPromise: Promise<any> | null = null
        const originalFetch = globalThis.fetch
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({}),
        } as any)

        const payload = {
            type: 'block_actions',
            user: { id: 'U12345', name: 'operator' },
            channel: { id: 'C0C4CK27LA1', name: 'ask-jules' },
            response_url: 'https://hooks.slack.com/actions/T123/B456/XYZ789',
            actions: [
                {
                    action_id: 'jules_dismiss_card',
                    value: JSON.stringify({
                        action: 'dismiss',
                        repo: 'camp-candor/000.repo-bot',
                        sessionId: 'session_abc123',
                    }),
                },
            ],
        }

        const encodedBody = `payload=${encodeURIComponent(JSON.stringify(payload))}`
        const ctx: any = {
            req: {
                text: async () => encodedBody,
                header: () => undefined,
            },
            env: {
                SLACK_SIGNING_SECRET: undefined,
            },
            executionCtx: {
                waitUntil: (p: Promise<any>) => {
                    executedPromise = p
                },
            },
            json: (body: any, status = 200) => ({ body, status }),
            text: (msg: string, status = 200) => ({ body: msg, status }),
        }

        const res = await handleSlackInteraction(ctx)
        expect(res.status).toBe(200)
        expect(res.body).toEqual({ delete_original: true })
        expect(executedPromise).not.toBeNull()
        await executedPromise

        expect(globalThis.fetch).toHaveBeenCalledWith(
            'https://hooks.slack.com/actions/T123/B456/XYZ789',
            expect.objectContaining({
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ delete_original: true }),
            }),
        )

        globalThis.fetch = originalFetch
    })
})

describe('GitHub Webhook Merged PR Jules Card Suppression', () => {
    it('does not dispatch redundant postSlackJulesMessage card to #ask-jules or #jules-winnfield on merged PR', async () => {
        const postedMessages: any[] = []
        const originalFetch = globalThis.fetch
        globalThis.fetch = vi
            .fn()
            .mockImplementation(async (url: string, init?: any) => {
                if (url.includes('slack.com/api/chat.postMessage')) {
                    postedMessages.push(JSON.parse(init.body))
                    return {
                        ok: true,
                        json: async () => ({ ok: true, ts: '12345.6789' }),
                    }
                }
                return {
                    ok: true,
                    json: async () => ({}),
                    text: async () => '',
                }
            }) as any

        const waitUntilPromises: Promise<any>[] = []
        const mockEnv = {
            SLACK_BOT_TOKEN: 'xoxb-mock-token',
            SLACK_CHANNEL_ID: 'C0C40FMRQ9H', // #ops-bridge
            SLACK_ASK_JULES_CHANNEL_ID: 'C0C4M8K7LV8', // #ask-jules
            SLACK_JULES_CHANNEL_ID: 'C0C4CK27LA1', // #jules-winnfield

            DB: {
                prepare: vi.fn().mockReturnValue({
                    bind: vi.fn().mockReturnThis(),
                    first: vi.fn().mockResolvedValue(null),
                    run: vi.fn().mockResolvedValue({ success: true }),
                }),
                exec: vi.fn().mockResolvedValue(undefined),
            },
            REPO_BOT_DO: {
                idFromName: () => 'mock-id',
                get: () => ({
                    fetch: async () =>
                        new Response(JSON.stringify({ ok: true })),
                }),
            },
        }

        const executionCtx = {
            waitUntil: (p: Promise<any>) => waitUntilPromises.push(p),
        }

        const webhookPayload = {
            action: 'closed',
            repository: {
                name: '000.repo-bot',
                full_name: 'camp-candor/000.repo-bot',
                owner: { login: 'camp-candor' },
            },
            pull_request: {
                number: 83,
                merged: true,
                html_url: 'https://github.com/camp-candor/000.repo-bot/pull/83',
                merge_commit_sha: '3a9f1bc111122223333444455556666777788889',
                head: {
                    sha: '1234567890abcdef1234567890abcdef12345678',
                    ref: 'jules/feat-merge-test',
                },
                base: {
                    ref: 'main',
                },
                user: {
                    login: 'google-jules[bot]',
                },
                merged_by: {
                    login: 'repo-bot',
                },
                title: 'feat: jules automated enhancement',
                body: 'squash merge completed by repo-bot',
            },
        }

        const req = new Request('http://localhost/webhook', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-github-event': 'pull_request',
            },
            body: JSON.stringify(webhookPayload),
        })

        const res = await app.fetch(req, mockEnv as any, executionCtx as any)
        expect(res.status).toBe(200)

        await Promise.all(waitUntilPromises)

        // Verify #ask-jules and #jules-winnfield received 0 cards
        const askJulesCards = postedMessages.filter(
            (m) => m.channel === 'C0C4M8K7LV8',
        )
        const julesWinnfieldCards = postedMessages.filter(
            (m) => m.channel === 'C0C4CK27LA1',
        )
        expect(askJulesCards).toHaveLength(0)
        expect(julesWinnfieldCards).toHaveLength(0)

        // Verify canonical #ops-bridge release announcement was dispatched
        const opsBridgeMessages = postedMessages.filter(
            (m) => m.channel === 'C0C40FMRQ9H',
        )
        expect(opsBridgeMessages.length).toBeGreaterThan(0)
        expect(opsBridgeMessages[0].text).toContain('[RELEASE]')
        expect(opsBridgeMessages[0].text).toContain('merged into main')

        globalThis.fetch = originalFetch
    })
})

describe('Directive Indicator on Jules Slack Cards & Storage Association', () => {
    const mockEnv = {
        SLACK_JULES_CHANNEL_ID: 'C0C4CK27LA1',
        SLACK_ASK_JULES_CHANNEL_ID: 'C0C4M8K7LV8',
        SLACK_CHANNEL_ID: 'C0C40FMRQ9H',
        SLACK_BOT_TOKEN: 'xoxb-mock-token',
    }

    it('extractDirectivePath extracts directive paths with forward slashes and backslashes', () => {
        expect(
            extractDirectivePath(
                'execute [data/directive/day-001/000.jules.md]',
            ),
        ).toBe('data/directive/day-001/000.jules.md')
        expect(
            extractDirectivePath(
                'execute [data\\directive\\day-005\\005.card-directive.md]',
            ),
        ).toBe('data/directive/day-005/005.card-directive.md')
        expect(
            extractDirectivePath('data\\directive\\day-002\\001.task.md'),
        ).toBe('data/directive/day-002/001.task.md')
        expect(extractDirectivePath('execute [./data/directive/foo.md]')).toBe(
            'data/directive/foo.md',
        )
        expect(extractDirectivePath('bump version in package.json')).toBeNull()
        expect(extractDirectivePath('')).toBeNull()
    })

    it('buildJulesStatusCard renders prominent *DIRECTIVE:* block directly beneath header when directive is provided', () => {
        const directive = 'data/directive/day-005/005.card-directive.md'
        const card = buildJulesStatusCard(
            {
                sessionId: 'session_directive_123',
                repo: 'camp-candor/000.repo-bot',
                taskId: 'spec/task-005',
                status: 'READY_FOR_REVIEW',
                branchName: 'spec/task-005',
                directive,
            },
            mockEnv,
        )

        expect(card).not.toBeNull()
        const blocks = card!.attachments[0].blocks
        expect(blocks[0].type).toBe('header')
        expect(blocks[1].type).toBe('section')
        expect(blocks[1].text.text).toBe(`*DIRECTIVE:* \`${directive}\``)
    })

    it('buildJulesStatusCard fallback text includes directive snippet', () => {
        const directive = 'data/directive/day-001/000.jules.md'
        const card = buildJulesStatusCard(
            {
                sessionId: 'session_directive_456',
                repo: 'camp-candor/000.repo-bot',
                status: 'READY_FOR_REVIEW',
                directive,
            },
            mockEnv,
        )

        expect(card).not.toBeNull()
        expect(card!.text).toContain(`[${directive}]`)
        expect(card!.text).toContain('Jules Update [READY_FOR_REVIEW]')
    })

    it('buildJulesStatusCard omits directive block when directive is not provided', () => {
        const card = buildJulesStatusCard(
            {
                sessionId: 'session_nodirective',
                repo: 'camp-candor/000.repo-bot',
                status: 'READY_FOR_REVIEW',
            },
            mockEnv,
        )

        expect(card).not.toBeNull()
        const blocks = card!.attachments[0].blocks
        expect(blocks[0].type).toBe('header')
        expect(blocks[1].type).toBe('section')
        expect(blocks[1].fields).toBeDefined()
        expect(card!.text).not.toContain('*DIRECTIVE:*')
    })

    it('postSlackMergeAnnouncement includes FULFILLED DIRECTIVE when directive is provided', async () => {
        const originalFetch = globalThis.fetch
        let postedPayload: any = null
        globalThis.fetch = vi
            .fn()
            .mockImplementation(async (url: string, init?: any) => {
                if (url.includes('slack.com/api/chat.postMessage')) {
                    postedPayload = JSON.parse(init.body)
                    return {
                        ok: true,
                        json: async () => ({ ok: true, ts: '111.222' }),
                    }
                }
                return { ok: true, json: async () => ({}) }
            }) as any

        await postSlackMergeAnnouncement(
            {
                taskId: 'task-05',
                pullNumber: 99,
                mergeCommitSha: 'abcdef1234567890abcdef1234567890abcdef12',
                auditedHeadSha: '1234567abcdef1234567890abcdef1234567890a',
                directive: 'data/directive/day-005/005.card-directive.md',
            },
            mockEnv as any,
        )

        expect(postedPayload).not.toBeNull()
        const sectionBlock = postedPayload.blocks.find(
            (b: any) =>
                b.type === 'section' &&
                b.text?.text?.includes('>> FULFILLED DIRECTIVE:'),
        )
        expect(sectionBlock).toBeDefined()
        expect(sectionBlock.text.text).toContain(
            '>> FULFILLED DIRECTIVE: data/directive/day-005/005.card-directive.md',
        )

        globalThis.fetch = originalFetch
    })

    it('handles pull_request opened webhook with directive in PR body', async () => {
        const originalFetch = globalThis.fetch
        let postedCard: any = null
        globalThis.fetch = vi
            .fn()
            .mockImplementation(async (url: string, init?: any) => {
                if (url.includes('slack.com/api/chat.postMessage')) {
                    postedCard = JSON.parse(init.body)
                    return {
                        ok: true,
                        json: async () => ({ ok: true, ts: '999.888' }),
                    }
                }
                return { ok: true, json: async () => ({}) }
            }) as any

        const waitUntilPromises: Promise<any>[] = []
        const executionCtx = {
            waitUntil: (p: Promise<any>) => waitUntilPromises.push(p),
        }

        const req = new Request('http://localhost/webhook', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-github-event': 'pull_request',
            },
            body: JSON.stringify({
                action: 'opened',
                repository: { full_name: 'camp-candor/000.repo-bot' },
                pull_request: {
                    number: 101,
                    html_url:
                        'https://github.com/camp-candor/000.repo-bot/pull/101',
                    head: { ref: 'jules/directive-test', sha: 'a1b2c3d4e5f6' },
                    user: { login: 'google-jules[bot]' },
                    title: 'feat: apply directive',
                    body: 'execute [data/directive/day-005/005.card-directive.md]',
                },
            }),
        })

        const res = await app.fetch(req, mockEnv as any, executionCtx as any)
        expect(res.status).toBe(200)
        await Promise.all(waitUntilPromises)

        expect(postedCard).not.toBeNull()
        const blocks = postedCard.attachments[0].blocks
        expect(blocks[1].text.text).toBe(
            '*DIRECTIVE:* `data/directive/day-005/005.card-directive.md`',
        )

        globalThis.fetch = originalFetch
    })

    it('RepoBotDO stores and retrieves session directive metadata via /sessions', async () => {
        const { RepoBotDO } = await import('../../src/RepoBotDO.js')
        const storageMap = new Map<string, any>()
        const mockStorage: any = {
            get: vi.fn(async (key: string) => storageMap.get(key)),
            put: vi.fn(async (key: string, val: any) => {
                storageMap.set(key, val)
            }),
        }
        const mockContext = {
            ctx: { storage: mockStorage, waitUntil: () => {} },
            env: {} as any,
        }

        // 1. POST /sessions
        const postReq = new Request('http://internal/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionId: 'session_12345',
                branch: 'spec/test-branch-001',
                repo: 'camp-candor/000.repo-bot',
                directive: 'data/directive/day-005/005.card-directive.md',
            }),
        })
        const postRes = await RepoBotDO.prototype.fetch.call(
            mockContext as any,
            postReq,
        )
        expect(postRes.status).toBe(201)
        const postData: any = await postRes.json()
        expect(postData.ok).toBe(true)
        expect(postData.session.directive).toBe(
            'data/directive/day-005/005.card-directive.md',
        )

        // 2. GET /sessions/:branch
        const getReq = new Request(
            'http://internal/sessions/spec%2Ftest-branch-001',
            { method: 'GET' },
        )
        const getRes = await RepoBotDO.prototype.fetch.call(
            mockContext as any,
            getReq,
        )
        expect(getRes.status).toBe(200)
        const getData: any = await getRes.json()
        expect(getData.sessionId).toBe('session_12345')
        expect(getData.branch).toBe('spec/test-branch-001')
        expect(getData.directive).toBe(
            'data/directive/day-005/005.card-directive.md',
        )

        // 3. GET /sessions/:branch with refs/heads prefix fallback
        const getRefReq = new Request(
            'http://internal/sessions/refs%2Fheads%2Fspec%2Ftest-branch-001',
            { method: 'GET' },
        )
        const getRefRes = await RepoBotDO.prototype.fetch.call(
            mockContext as any,
            getRefReq,
        )
        expect(getRefRes.status).toBe(200)
        const getRefData: any = await getRefRes.json()
        expect(getRefData.directive).toBe(
            'data/directive/day-005/005.card-directive.md',
        )
    })

    it('app proxies /sessions to REPO_BOT_DO stub', async () => {
        const mockStubFetch = vi.fn().mockResolvedValue(
            new Response(
                JSON.stringify({
                    ok: true,
                    session: {
                        sessionId: 'sess_1',
                        branch: 'spec/b1',
                        directive: 'data/directive/foo.md',
                    },
                }),
                {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                },
            ),
        )
        const envWithDO = {
            ...mockEnv,

            DB: {
                prepare: vi.fn().mockReturnValue({
                    bind: vi.fn().mockReturnThis(),
                    first: vi.fn().mockResolvedValue(null),
                    run: vi.fn().mockResolvedValue({ success: true }),
                }),
                exec: vi.fn().mockResolvedValue(undefined),
            },
            REPO_BOT_DO: {
                idFromName: vi.fn().mockReturnValue('mock-id'),
                get: vi.fn().mockReturnValue({ fetch: mockStubFetch }),
            },
        }

        const req = new Request('http://localhost/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionId: 'sess_1',
                branch: 'spec/b1',
                directive: 'data/directive/foo.md',
            }),
        })

        const res = await app.fetch(req, envWithDO as any)
        expect(res.status).toBe(200)
        expect(mockStubFetch).toHaveBeenCalled()
    })
})
