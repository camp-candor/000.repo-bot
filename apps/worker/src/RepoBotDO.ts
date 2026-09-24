import {
    executeCompensatingSaga,
    type RollbackParams,
} from './rollbackEngine.js'
import { DurableObject } from 'cloudflare:workers'

import { dispatchSlackApprovalCard, updateSlackMessage } from './slackBridge.js'
import { executeShaPinnedMerge } from './mergeExecutor.js'
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
    owner?: string
    repo?: string
    pullNumber?: number
    auditedHeadSha: string | null
    scopeCheckPassed: boolean
    isHighRiskPath: boolean
    dominantRiskClass?: string
    lastAuditViolations?: string[]
    highRiskFiles?: string[]
    attempts: number
    leaseEpoch: number
    updatedAt: number
    slackMessageTs?: string
    slackChannelId?: string
    mergeCommitSha?: string
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

export class RepoBotDO extends DurableObject<Env> {
    constructor(ctx: DurableObjectState, env: Env) {
        super(ctx, env)
    }

    /**
     * Watchdog Alarm: Handles 24-hour timeout for tasks stranded in AWAITING_APPROVAL.
     */
    async alarm(): Promise<void> {
        const context = await this.ctx.storage.get<FSMContext>('fsm_context')
        if (!context) return

        if (context.state === 'AWAITING_APPROVAL') {
            context.state = 'HALTED'
            context.updatedAt = Date.now()
            await this.ctx.storage.put('fsm_context', context)

            if (
                context.slackMessageTs &&
                context.slackChannelId &&
                this.env.SLACK_BOT_TOKEN
            ) {
                const expiredText = `*:: PR APPROVAL EXPIRED*\nTask: \`${context.taskId}\`\n*[HALTED]* 24-hour review window elapsed without sign-off. Work preserved non-destructively.`
                await updateSlackMessage(
                    context.slackChannelId,
                    context.slackMessageTs,
                    expiredText,
                    this.env,
                )
            }
            console.warn(
                `:: WATCHDOG: Task ${context.taskId} expired in AWAITING_APPROVAL. Transitioned to HALTED.`,
            )
        }
    }

    async fetch(request: Request): Promise<Response> {
        const url = new URL(request.url)
        const path = url.pathname

        // 1. GET /repos
        if (request.method === 'GET' && (path === '/repos' || path === '/')) {
            const repos =
                (await this.ctx.storage.get<WatchedRepo[]>('watched_repos')) ||
                []
            return new Response(JSON.stringify(repos), {
                headers: { 'Content-Type': 'application/json' },
            })
        }

        // 2. POST /repos
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

        // 3. DELETE /repos
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

        // 4. GET /fsm/context
        if (request.method === 'GET' && path === '/fsm/context') {
            const context =
                (await this.ctx.storage.get<FSMContext>('fsm_context')) || null
            return new Response(JSON.stringify(context), {
                headers: { 'Content-Type': 'application/json' },
            })
        }

        // 5. POST /fsm/context
        if (request.method === 'POST' && path === '/fsm/context') {
            const update: Partial<FSMContext> = (await request
                .json()
                .catch(() => ({}))) as Partial<FSMContext>
            const current =
                (await this.ctx.storage.get<FSMContext>('fsm_context')) ||
                ({
                    taskId: update.taskId || 'UNKNOWN',
                    state: 'VERIFYING',
                    owner: undefined,
                    repo: undefined,
                    pullNumber: undefined,
                    auditedHeadSha: null,
                    scopeCheckPassed: false,
                    isHighRiskPath: false,
                    attempts: 0,
                    leaseEpoch: 1,
                    updatedAt: Date.now(),
                    slackMessageTs: undefined,
                    slackChannelId: undefined,
                    mergeCommitSha: undefined,
                } as FSMContext)

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

        // 6. POST /fsm/transition
        if (request.method === 'POST' && path === '/fsm/transition') {
            const body: any = await request.json().catch(() => null)
            const context =
                (await this.ctx.storage.get<FSMContext>('fsm_context')) ||
                ({
                    taskId: body?.taskId || 'UNKNOWN',
                    state: 'VERIFYING',
                    owner: body?.owner,
                    repo: body?.repo,
                    pullNumber: body?.pullNumber,
                    auditedHeadSha: body?.headSha,
                    scopeCheckPassed: true,
                    isHighRiskPath: false,
                    attempts: 0,
                    leaseEpoch: 1,
                    updatedAt: Date.now(),
                    slackMessageTs: undefined,
                    slackChannelId: undefined,
                    mergeCommitSha: undefined,
                } as FSMContext)

            // Stale Head SHA Guard
            if (
                body?.type !== 'PR_SYNCHRONIZE' &&
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

            const previousState = context.state
            let nextState = context.state
            let shouldTriggerMerge = false
            let shouldTriggerRollback = false
            let rollbackReason =
                body?.reason || body?.type || 'UNSPECIFIED_FAILURE'

            // Event A: QUALITY_PASS
            if (body?.type === 'QUALITY_PASS') {
                if (!context.isHighRiskPath && context.scopeCheckPassed) {
                    nextState = 'MERGING'
                    shouldTriggerMerge = true
                } else if (context.isHighRiskPath && context.scopeCheckPassed) {
                    nextState = 'AWAITING_APPROVAL'
                    await this.ctx.storage.setAlarm(
                        Date.now() + 24 * 60 * 60 * 1000,
                    )

                    if (this.env.SLACK_BOT_TOKEN) {
                        const cardParams = {
                            taskId: context.taskId,
                            owner:
                                context.owner || body?.owner || 'camp-candor',
                            repo: context.repo || body?.repo || '000.repo-bot',
                            pullNumber:
                                context.pullNumber || body?.pullNumber || 0,
                            headSha: context.auditedHeadSha || body.headSha,
                            branchName: `spec/${context.taskId}`,
                            highRiskFiles:
                                context.highRiskFiles ||
                                context.lastAuditViolations ||
                                [],
                        }

                        this.ctx.waitUntil(
                            dispatchSlackApprovalCard(
                                cardParams,
                                this.env,
                            ).then(async (res) => {
                                if (res.ok && res.ts) {
                                    context.slackMessageTs = res.ts
                                    context.slackChannelId =
                                        this.env.SLACK_CHANNEL_ID ||
                                        '#ops-bridge'
                                    await this.ctx.storage.put(
                                        'fsm_context',
                                        context,
                                    )
                                }
                            }),
                        )
                    }
                }
            }

            // Event B: QUALITY_FAIL_RETRY
            else if (body?.type === 'QUALITY_FAIL_RETRY') {
                const nextAttempts = context.attempts + 1
                if (nextAttempts < 3) {
                    nextState = 'RETRYING'
                    context.attempts = nextAttempts
                    context.leaseEpoch += 1
                } else {
                    nextState = 'ROLLING_BACK'
                    shouldTriggerRollback = true
                    rollbackReason =
                        'QUALITY_GAUNTLET_EXHAUSTED (3/3 attempts failed)'
                }
            }

            // Event C: HUMAN_APPROVED (Trigger merge from approval bridge)
            else if (body?.type === 'HUMAN_APPROVED') {
                if (context.state === 'AWAITING_APPROVAL') {
                    nextState = 'MERGING'
                    shouldTriggerMerge = true
                }
            }

            // Event D: HUMAN_REJECTED
            else if (body?.type === 'HUMAN_REJECTED') {
                if (
                    context.state === 'AWAITING_APPROVAL' ||
                    context.state === 'VERIFYING'
                ) {
                    nextState = 'ROLLING_BACK'
                    shouldTriggerRollback = true
                    rollbackReason = `HUMAN_REJECTED by ${body?.actor || 'Lead Architect'}`
                }
            }

            // Event E: PR_SYNCHRONIZE
            else if (body?.type === 'PR_SYNCHRONIZE') {
                if (
                    context.slackMessageTs &&
                    context.slackChannelId &&
                    this.env.SLACK_BOT_TOKEN
                ) {
                    const voidText = `*:: PR AWAITING APPROVAL VOIDED*\nTask: \`${context.taskId}\`\n~Status: Awaiting Review~\n*[VOIDED]* Head commit moved to \`${(body.headSha || '').slice(0, 7)}\`. Re-auditing in progress...`
                    this.ctx.waitUntil(
                        updateSlackMessage(
                            context.slackChannelId,
                            context.slackMessageTs,
                            voidText,
                            this.env,
                        ),
                    )
                }
                nextState = 'VERIFYING'
                context.auditedHeadSha = body.headSha
            }

            // Event F: MERGE_SUCCEEDED / MERGE_FAILED
            else if (body?.type === 'MERGE_SUCCEEDED') {
                nextState = 'MERGED'
                context.mergeCommitSha = body.mergeCommitSha
            } else if (body?.type === 'MERGE_FAILED') {
                nextState = 'ROLLING_BACK'
                shouldTriggerRollback = true
                rollbackReason = body?.error || 'CAS_MERGE_EXECUTION_FAILED'
            }

            // Event G: POST_MERGE_REGRESSION (Tier-2 Revert Trigger)
            else if (body?.type === 'POST_MERGE_REGRESSION') {
                nextState = 'ROLLING_BACK'
                shouldTriggerRollback = true
                rollbackReason =
                    body?.reason || 'POST_MERGE_CANARY_HEALTH_FAILURE'
            }

            context.state = nextState
            context.updatedAt = Date.now()
            await this.ctx.storage.put('fsm_context', context)

            // Trigger SHA-Pinned Merge Execution via Outbox
            if (shouldTriggerMerge) {
                const mergePayload = {
                    taskId: context.taskId,
                    owner: context.owner || body?.owner || 'camp-candor',
                    repo: context.repo || body?.repo || '000.repo-bot',
                    pullNumber: context.pullNumber || body?.pullNumber || 0,
                    auditedHeadSha: context.auditedHeadSha || body.headSha,
                    actor: body?.actor || 'repo-bot',
                    slackMessageTs: context.slackMessageTs,
                    slackChannelId: context.slackChannelId,
                }

                this.ctx.waitUntil(
                    executeShaPinnedMerge(mergePayload, this.env).then(
                        async (result) => {
                            const updated =
                                await this.ctx.storage.get<FSMContext>(
                                    'fsm_context',
                                )
                            if (updated) {
                                if (result.success) {
                                    updated.state = 'MERGED'
                                    if (result.mergeCommitSha)
                                        updated.mergeCommitSha =
                                            result.mergeCommitSha
                                } else {
                                    updated.state = 'ROLLING_BACK'
                                    // Trigger compensating saga for failed merge
                                    const rollbackPayload: RollbackParams = {
                                        taskId: updated.taskId,
                                        owner: updated.owner || 'camp-candor',
                                        repo: updated.repo || '000.repo-bot',
                                        pullNumber: updated.pullNumber || 0,
                                        headSha:
                                            updated.auditedHeadSha || '0000000',
                                        branchName: `spec/${updated.taskId.toLowerCase()}`,
                                        reason:
                                            result.error || 'CAS_MERGE_FAILED',
                                        actor: 'repo-bot',
                                        slackMessageTs: updated.slackMessageTs,
                                        slackChannelId: updated.slackChannelId,
                                    }
                                    executeCompensatingSaga(
                                        rollbackPayload,
                                        this.env,
                                    ).then(async () => {
                                        updated.state = 'ROLLED_BACK'
                                        await this.ctx.storage.put(
                                            'fsm_context',
                                            updated,
                                        )
                                    })
                                }
                                updated.updatedAt = Date.now()
                                await this.ctx.storage.put(
                                    'fsm_context',
                                    updated,
                                )
                            }
                        },
                    ),
                )
            }

            // Trigger Compensating Saga Rollback via Outbox
            if (shouldTriggerRollback) {
                // Disarm watchdog alarm
                await this.ctx.storage.deleteAlarm()

                const rollbackPayload: RollbackParams = {
                    taskId: context.taskId,
                    owner: context.owner || body?.owner || 'camp-candor',
                    repo: context.repo || body?.repo || '000.repo-bot',
                    pullNumber: context.pullNumber || body?.pullNumber || 0,
                    headSha:
                        context.auditedHeadSha || body?.headSha || '0000000',
                    branchName: `spec/${context.taskId.toLowerCase()}`,
                    reason: rollbackReason,
                    actor: body?.actor || 'repo-bot',
                    slackMessageTs: context.slackMessageTs,
                    slackChannelId: context.slackChannelId,
                    mergeCommitSha: context.mergeCommitSha,
                }

                this.ctx.waitUntil(
                    executeCompensatingSaga(rollbackPayload, this.env).then(
                        async (sagaRes) => {
                            const updated =
                                await this.ctx.storage.get<FSMContext>(
                                    'fsm_context',
                                )
                            if (updated) {
                                updated.state = 'ROLLED_BACK'
                                updated.updatedAt = Date.now()
                                await this.ctx.storage.put(
                                    'fsm_context',
                                    updated,
                                )
                                console.log(
                                    `>> [DO SAGA] Task ${updated.taskId} state settled in ROLLED_BACK (Success: ${sagaRes.success})`,
                                )
                            }
                        },
                    ),
                )
            }

            return new Response(
                JSON.stringify({
                    action: 'STATE_TRANSITIONED',
                    previousState,
                    state: nextState,
                    context,
                }),
                { headers: { 'Content-Type': 'application/json' } },
            )
        }

        return new Response(JSON.stringify({ status: 'REPO_BOT_DO_ONLINE' }), {
            headers: { 'Content-Type': 'application/json' },
        })
    }
}
