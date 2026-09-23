import { DurableObject } from 'cloudflare:workers'
import type { Env } from './tools.js'

export interface WatchedRepo {
    id: string
    owner: string
    repo: string
    url: string
    addedAt: string
}

export interface FSMContext {
    taskId: string
    state: string
    auditedHeadSha: string | null
    scopeCheckPassed: boolean
    isHighRiskPath: boolean
    attempts: number
    leaseEpoch: number
    updatedAt: number
}

export function parseRepoIdentifier(
    rawInput: string,
): { owner: string; repo: string; id: string; url: string } | null {
    if (!rawInput || typeof rawInput !== 'string') return null

    let cleaned = rawInput.trim()
    cleaned = cleaned.replace(/^git@github\.com:/i, '')
    cleaned = cleaned.replace(/^https?:\/\/github\.com\//i, '')
    cleaned = cleaned.replace(/\.git$/i, '')
    cleaned = cleaned.replace(/^\/+|\/+$/g, '')

    const parts = cleaned.split('/')
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null

    const owner = parts[0].trim()
    const repo = parts[1].trim()
    const id = `${owner}/${repo}`.toLowerCase()
    const url = `https://github.com/${owner}/${repo}`

    return { owner, repo, id, url }
}

export class RepoBotDO extends DurableObject {
    constructor(ctx: DurableObjectState, env: Env) {
        super(ctx, env)
    }

    async fetch(request: Request): Promise<Response> {
        const url = new URL(request.url)
        const path = url.pathname

        // 1. GET /repos — List all registered repositories
        if (request.method === 'GET' && (path === '/repos' || path === '/')) {
            const repos =
                (await this.ctx.storage.get<WatchedRepo[]>('watched_repos')) ||
                []
            return new Response(JSON.stringify(repos), {
                headers: { 'Content-Type': 'application/json' },
            })
        }

        // 2. POST /repos — Register a repository
        if (request.method === 'POST' && path === '/repos') {
            const body: any = await request.json().catch(() => null)
            const parsed = parseRepoIdentifier(body?.url || body?.repo || '')

            if (!parsed) {
                return new Response(
                    JSON.stringify({ error: 'Invalid repository URL or slug' }),
                    {
                        status: 400,
                        headers: { 'Content-Type': 'application/json' },
                    },
                )
            }

            const repos =
                (await this.ctx.storage.get<WatchedRepo[]>('watched_repos')) ||
                []
            const exists = repos.find((r) => r.id === parsed.id)

            if (!exists) {
                const newEntry: WatchedRepo = {
                    id: parsed.id,
                    owner: parsed.owner,
                    repo: parsed.repo,
                    url: parsed.url,
                    addedAt: new Date().toISOString(),
                }
                repos.push(newEntry)
                await this.ctx.storage.put('watched_repos', repos)
                return new Response(
                    JSON.stringify({ action: 'REPO_WATCHED', repo: newEntry }),
                    {
                        status: 201,
                        headers: { 'Content-Type': 'application/json' },
                    },
                )
            }

            return new Response(
                JSON.stringify({ action: 'ALREADY_EXISTS', repo: exists }),
                {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                },
            )
        }

        // 3. DELETE /repos — Unregister a repository
        if (request.method === 'DELETE' && path === '/repos') {
            const body: any = await request.json().catch(() => null)
            const target =
                body?.id ||
                body?.url ||
                body?.repo ||
                url.searchParams.get('url') ||
                url.searchParams.get('id')
            const parsed = parseRepoIdentifier(target || '')

            if (!parsed) {
                return new Response(
                    JSON.stringify({ error: 'Repository target required' }),
                    {
                        status: 400,
                        headers: { 'Content-Type': 'application/json' },
                    },
                )
            }

            const repos =
                (await this.ctx.storage.get<WatchedRepo[]>('watched_repos')) ||
                []
            const filtered = repos.filter((r) => r.id !== parsed.id)
            const removed = filtered.length < repos.length

            if (removed) {
                await this.ctx.storage.put('watched_repos', filtered)
            }

            return new Response(
                JSON.stringify({
                    action: removed ? 'REPO_UNWATCHED' : 'REPO_NOT_FOUND',
                    id: parsed.id,
                }),
                {
                    status: removed ? 200 : 404,
                    headers: { 'Content-Type': 'application/json' },
                },
            )
        }

        // 4. GET /fsm/context — Retrieve current task context
        if (request.method === 'GET' && path === '/fsm/context') {
            const context =
                (await this.ctx.storage.get<FSMContext>('fsm_context')) || null
            return new Response(JSON.stringify(context), {
                headers: { 'Content-Type': 'application/json' },
            })
        }

        // 5. POST /fsm/context — Initialize or update task context
        if (request.method === 'POST' && path === '/fsm/context') {
            const update: Partial<FSMContext> = (await request
                .json()
                .catch(() => ({}))) as Partial<FSMContext>
            const update: any = await request.json().catch(() => ({}))
            const current = (await this.ctx.storage.get<FSMContext>(
                'fsm_context',
            )) || {
                taskId: update.taskId || 'UNKNOWN',
                state: 'VERIFYING',
                auditedHeadSha: null,
                scopeCheckPassed: false,
                isHighRiskPath: false,
                attempts: 0,
                leaseEpoch: 1,
                updatedAt: Date.now(),
            }

            const merged: FSMContext = {
                ...current,
                ...update,
                updatedAt: Date.now(),
            }

            await this.ctx.storage.put('fsm_context', merged)
            return new Response(
                JSON.stringify({ action: 'CONTEXT_UPDATED', context: merged }),
                {
                    headers: { 'Content-Type': 'application/json' },
                },
            )
        }

        // 6. POST /fsm/transition — Process quality event transitions
        if (request.method === 'POST' && path === '/fsm/transition') {
            const body: any = await request.json().catch(() => null)
            const context = (await this.ctx.storage.get<FSMContext>(
                'fsm_context',
            )) || {
                taskId: body?.taskId || 'UNKNOWN',
                state: 'VERIFYING',
                auditedHeadSha: body?.headSha,
                scopeCheckPassed: true,
                isHighRiskPath: false,
                attempts: 0,
                leaseEpoch: 1,
                updatedAt: Date.now(),
            }

            // Stale Head SHA Guard
            if (
                context.auditedHeadSha &&
                body?.headSha &&
                context.auditedHeadSha !== body.headSha
            ) {
                return new Response(
                    JSON.stringify({
                        error: 'STALE_SHA_REJECTED',
                        expected: context.auditedHeadSha,
                        received: body.headSha,
                    }),
                    {
                        status: 409,
                        headers: { 'Content-Type': 'application/json' },
                    },
                )
            }

            let nextState = context.state

            if (body?.type === 'QUALITY_PASS') {
                if (!context.isHighRiskPath && context.scopeCheckPassed) {
                    nextState = 'MERGING'
                } else if (context.isHighRiskPath) {
                    nextState = 'AWAITING_APPROVAL'
                }
            } else if (body?.type === 'QUALITY_FAIL_RETRY') {
                const nextAttempts = context.attempts + 1
                if (nextAttempts < 3) {
                    nextState = 'RETRYING'
                    context.attempts = nextAttempts
                    context.leaseEpoch += 1
                } else {
                    nextState = 'ROLLING_BACK'
                }
            }

            context.state = nextState
            context.updatedAt = Date.now()
            await this.ctx.storage.put('fsm_context', context)

            return new Response(
                JSON.stringify({
                    action: 'STATE_TRANSITIONED',
                    previousState: context.state,
                    state: nextState,
                    context,
                }),
                {
                    headers: { 'Content-Type': 'application/json' },
                },
            )
        }

        return new Response(JSON.stringify({ status: 'REPO_BOT_DO_ONLINE' }), {
            headers: { 'Content-Type': 'application/json' },
        })
    }
}
