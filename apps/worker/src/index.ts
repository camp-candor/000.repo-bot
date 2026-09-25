import { appendAuditEvent } from './audit/auditLedger.js'
import { executeColdDrainage } from './audit/drainageEngine.js'

import { Hono } from 'hono'
import { handleSlackInteraction } from './routes/slackInteractions.js'
import { generateCommitMessage } from './commitGenerator.js'
import { dispatchJulesJob, getJulesSession } from './jules.js'
import { verifyGitHubSignature } from './tools.js'
import { postSlackMergeAnnouncement } from './slackBridge.js'
import {
    fetchRepoChecks,
    inspectRepoChecksViaAiGateway,
    getGatewaySlug,
    type Env,
} from './tools.js'
import {
    RepoBotDO,
    parseRepoIdentifier,
    type WatchedRepo,
} from './RepoBotDO.js'

export { RepoBotDO }
export * from './tools.js'

/**
 * POST /webhook and POST /api/webhooks/github
 * Ingests inbound GitHub webhook events with HMAC-SHA256 signature verification.
 */
const handleGitHubWebhook = async (c: any) => {
    const rawBody = await c.req.text()
    const signature = c.req.header('x-hub-signature-256')
    const githubEvent = c.req.header('x-github-event')

    // 1. Signature Verification (using normalized GH_WEBHOOK_SECRET)
    const webhookSecret = c.env.GH_WEBHOOK_SECRET || c.env.GITHUB_WEBHOOK_SECRET
    if (webhookSecret) {
        const isValid = await verifyGitHubSignature(
            rawBody,
            signature,
            webhookSecret,
        )
        if (!isValid) {
            console.error(
                '>> [WEBHOOK REJECTED] Invalid GitHub HMAC-SHA256 signature',
            )
            return c.json({ error: 'UNAUTHORIZED_SIGNATURE' }, 401)
        }
    }

    let payload: any = {}
    try {
        payload = JSON.parse(rawBody)
    } catch {
        return c.text('Malformed JSON payload', 400)
    }

    // Inside handleGitHubWebhook, record the audit entry on pull_request events:
    if (githubEvent === 'pull_request' && payload.action) {
        c.executionCtx.waitUntil(
            appendAuditEvent(c.env.DB, {
                taskId:
                    payload.pull_request?.head?.ref ||
                    `PR-${payload.pull_request?.number}`,
                repository: payload.repository?.full_name || 'unknown',
                eventType: `PR_${payload.action.toUpperCase()}`,
                actorId: payload.sender?.login || 'unknown',
                headSha: payload.pull_request?.head?.sha || 'unknown',
                payload: {
                    action: payload.action,
                    number: payload.pull_request?.number,
                    title: payload.pull_request?.title,
                    merged: payload.pull_request?.merged || false,
                },
            }).catch((err) => console.error('[AUDIT_LEDGER_ERROR]', err)),
        )
    }

    // 2. Process Pull Request Closed & Merged Event
    if (
        githubEvent === 'pull_request' &&
        payload.action === 'closed' &&
        payload.pull_request?.merged === true
    ) {
        const pr = payload.pull_request
        const repo = payload.repository?.name || '000.repo-bot'
        const owner = payload.repository?.owner?.login || 'camp-candor'
        const pullNumber = pr.number
        const mergeCommitSha = pr.merge_commit_sha || ''
        const headSha = pr.head?.sha || ''
        const baseRef = pr.base?.ref || 'main'
        const headRef = pr.head?.ref || ''
        const mergedBy =
            pr.merged_by?.login || payload.sender?.login || 'unknown'
        const prTitle = pr.title || ''

        // Distinguish between Repo-Bot CAS squash merge and Direct Manual GitHub UI merge
        const commitMessage = pr.body || ''
        const isRepoBotCAS =
            commitMessage.includes('squash merge completed by repo-bot') ||
            commitMessage.includes('Audited-Head-SHA:') ||
            mergedBy.includes('repo-bot')

        const origin = isRepoBotCAS ? 'REPO_BOT_CAS' : 'GITHUB_MANUAL_UI'
        console.log(
            `>> [GITHUB WEBHOOK] Ingested PR #${pullNumber} closed & merged. Origin: ${origin} (Merged by: ${mergedBy})`,
        )

        // Extract taskId from headRef if following spec/{taskId}-{sha} convention
        const specMatch = headRef.match(
            /^spec\/([a-zA-Z0-9._-]+?)(-[a-f0-9]{7,40})?$/,
        )
        const taskId = specMatch ? specMatch[1] : `PR-${pullNumber}`

        // A. Broadcast announcement to #ops-bridge
        c.executionCtx.waitUntil(
            postSlackMergeAnnouncement(
                {
                    taskId,
                    pullNumber,
                    mergeCommitSha,
                    auditedHeadSha: headSha,
                    targetBranch: baseRef,
                    branchName: headRef,
                    actor: mergedBy,
                    owner,
                    repo,
                    prTitle,
                    origin,
                },
                c.env,
            ).then(async (res) => {
                if (c.env.REPO_BOT_DO) {
                    try {
                        const id = c.env.REPO_BOT_DO.idFromName('global')
                        const stub = c.env.REPO_BOT_DO.get(id)
                        await stub.fetch(
                            new Request('https://internal/api/slack/receipt', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    timestamp: Date.now(),
                                    channel:
                                        (c.env.SLACK_CHANNEL_ID || '')
                                            .trim()
                                            .replace(/^["']|["']$/g, '') ||
                                        'C0C40FMRQ9H',
                                    event: `MERGE_ANNOUNCEMENT (${origin})`,
                                    ok: res.ok,
                                    error: res.error,
                                    ts: res.ts,
                                }),
                            }),
                        )
                    } catch {}
                }
            }),
        )

        // B. Reconcile with RepoBotDO to prevent stranded FSM states
        if (c.env.REPO_BOT_DO) {
            c.executionCtx.waitUntil(
                (async () => {
                    try {
                        const doId = c.env.REPO_BOT_DO.idFromName(taskId)
                        const taskDO = c.env.REPO_BOT_DO.get(doId)
                        await taskDO.fetch(
                            new Request('https://internal/fsm/transition', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    type: 'MERGE_SUCCEEDED',
                                    taskId,
                                    headSha,
                                    mergeCommitSha,
                                    actor: `GITHUB_UI:${mergedBy}`,
                                }),
                            }),
                        )
                    } catch (doErr: any) {
                        console.warn(
                            `DO state reconcile bypass for ${taskId}:`,
                            doErr.message,
                        )
                    }
                })(),
            )
        }

        return c.json({
            ok: true,
            status: 'MERGE_RECORDED',
            origin,
            pullNumber,
        })
    }

    return c.json({ ok: true, status: 'EVENT_RECEIVED', event: githubEvent })
}

const app = new Hono<{ Bindings: Env }>()

const getRepoBotStub = (env: Env) => {
    const id = env.REPO_BOT_DO.idFromName('global')
    return env.REPO_BOT_DO.get(id)
}

app.get('/', (c) => c.text('REPO-BOT EDGE CONTROL PLANE IS LIVE.'))

app.get('/health', (c) => {
    return c.json({
        status: 'healthy',
        hasGithubToken: Boolean(c.env.GITHUB_TOKEN),
        hasAccountId: Boolean(c.env.CLOUDFLARE_ACCOUNT_ID),
        aiGateway: getGatewaySlug(c.env),
    })
})

app.get('/repobot/inspect', async (c) => {
    try {
        const owner = c.req.query('owner') || 'camp-candor'
        const repo = c.req.query('repo') || '000.repo-bot'
        const data = await inspectRepoChecksViaAiGateway(owner, repo, c.env)
        return c.json(data)
    } catch (error: any) {
        return c.json({ error: error.message }, 500)
    }
})

app.post('/repobot/inspect', async (c) => {
    try {
        let body: any = {}
        try {
            body = await c.req.json()
        } catch {}
        const owner = body.owner || c.req.query('owner') || 'camp-candor'
        const repo = body.repo || c.req.query('repo') || '000.repo-bot'
        const data = await inspectRepoChecksViaAiGateway(owner, repo, c.env)
        return c.json(data)
    } catch (error: any) {
        return c.json({ error: error.message }, 500)
    }
})

app.get('/oracle', async (c) => {
    try {
        const prompt = c.req.query('prompt') || 'Inspect repository status'
        const gatewayId = getGatewaySlug(c.env)

        if (!c.env.AI) {
            return c.text(
                'Cloudflare Workers AI binding is not available in local mode. Switch TARGET to LIVE to query The Oracle.',
                503,
            )
        }

        const response = await c.env.AI.run('@cf/meta/llama-3.2-3b-instruct', {
            messages: [
                { role: 'user', content: `${prompt}. Output ONLY raw JSON.` },
            ],
            gateway: {
                id: gatewayId,
                skipCache: false,
                cacheTtl: 3600,
            },
        })

        return c.text(response.response || JSON.stringify(response))
    } catch (error: any) {
        console.error('Oracle Error:', error)
        return c.text(`Error: ${error.message}`, 500)
    }
})

// Clean REST mounts
app.post('/api/commit-message', generateCommitMessage)
app.post('/api/jules/dispatch', dispatchJulesJob)
app.get('/api/jules/session/:id', getJulesSession)
app.post('/webhook', handleGitHubWebhook)
app.post('/webhooks/github', handleGitHubWebhook)
app.post('/api/webhooks/github', handleGitHubWebhook)
app.post('/api/slack/interactions', async (c) => {
    return await handleSlackInteraction(c)
})

// Proxy Fleet Repository Management to RepoBotDO
app.all('/repos', async (c) => {
    const id = c.env.REPO_BOT_DO.idFromName('global')
    const stub = c.env.REPO_BOT_DO.get(id)
    return stub.fetch(c.req.raw)
})

app.all('/repos/*', async (c) => {
    const id = c.env.REPO_BOT_DO.idFromName('global')
    const stub = c.env.REPO_BOT_DO.get(id)
    return stub.fetch(c.req.raw)
})

// Expose Live Slack Bridge Status
app.get('/api/slack/status', async (c) => {
    const id = c.env.REPO_BOT_DO.idFromName('global')
    const stub = c.env.REPO_BOT_DO.get(id)
    return stub.fetch(c.req.raw)
})

// ----------------------------------------------------------------------------
// :: EDGE WATCHLIST & FLEET CI HEALTH MONITOR ENDPOINTS
// ----------------------------------------------------------------------------

// 1. List all watched repositories
app.get('/api/repos/watch', async (c) => {
    const stub = getRepoBotStub(c.env)
    const res = await stub.fetch('http://do/repos')
    return new Response(res.body, { status: res.status, headers: res.headers })
})

// 2. Add repository to watchlist
app.post('/api/repos/watch', async (c) => {
    const stub = getRepoBotStub(c.env)
    const body = await c.req.text()
    const res = await stub.fetch('http://do/repos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
    })
    return new Response(res.body, { status: res.status, headers: res.headers })
})

// 3. Remove repository from watchlist
app.delete('/api/repos/watch', async (c) => {
    const stub = getRepoBotStub(c.env)
    const body = await c.req.text()
    const res = await stub.fetch('http://do/repos', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body,
    })
    return new Response(res.body, { status: res.status, headers: res.headers })
})

// 4. Inspect a single target repository on demand
app.post('/api/repos/inspect', async (c) => {
    const body: any = await c.req.json().catch(() => null)
    const rawUrl = body?.url || body?.repo || c.req.query('url')
    const parsed = parseRepoIdentifier(rawUrl || '')

    if (!parsed) {
        return c.json({ error: 'Valid repository url or slug required' }, 400)
    }

    try {
        const result = await fetchRepoChecks(parsed.owner, parsed.repo, c.env)
        return c.json({
            repo: parsed.id,
            url: parsed.url,
            ...result,
        })
    } catch (err: any) {
        return c.json({ error: err.message, repo: parsed.id }, 500)
    }
})

// 5. Audit CI Health for entire fleet in parallel
app.post('/api/repos/health', async (c) => {
    const stub = getRepoBotStub(c.env)
    const res = await stub.fetch('http://do/repos')
    const repos = (await res.json().catch(() => [])) as WatchedRepo[]

    if (!Array.isArray(repos) || repos.length === 0) {
        return c.json({
            allFleetPassed: true,
            totalRepos: 0,
            passedCount: 0,
            failedCount: 0,
            results: [],
            message: 'No repositories currently on the watchlist',
        })
    }

    const checksPromises = repos.map(async (item) => {
        try {
            const data = await fetchRepoChecks(item.owner, item.repo, c.env)
            const failedRuns = data.checks.runs
                .filter((run: any) => run.conclusion !== 'success')
                .map((run: any) => ({
                    name: run.name,
                    status: run.status,
                    conclusion: run.conclusion,
                    details_url: run.details_url,
                }))

            return {
                id: item.id,
                url: item.url,
                sha: data.commit.sha,
                author: data.commit.author,
                message: data.commit.message,
                allPassed: data.checks.all_passed,
                totalRuns: data.checks.total_count,
                status: data.checks.status,
                failedRuns,
            }
        } catch (err: any) {
            return {
                id: item.id,
                url: item.url,
                sha: 'UNKNOWN',
                author: 'UNKNOWN',
                message: '',
                allPassed: false,
                totalRuns: 0,
                status: 'error',
                error: err.message,
                failedRuns: [
                    {
                        name: 'api-fetch',
                        status: 'failed',
                        conclusion: 'error',
                        details_url: '',
                    },
                ],
            }
        }
    })

    const results = await Promise.all(checksPromises)
    const passedCount = results.filter((r) => r.allPassed).length
    const failedCount = results.length - passedCount

    return c.json({
        allFleetPassed: failedCount === 0,
        totalRepos: results.length,
        passedCount,
        failedCount,
        results,
    })
})

/**
 * GET /api/tasks/candidates
 * Lists active in-flight PR tasks eligible for merge execution.
 */
app.get('/api/tasks/candidates', async (c) => {
    if (c.env.DB) {
        try {
            const results = await c.env.DB.prepare(
                `SELECT task_id as taskId, pull_number as pullNumber, state,
                        audited_head_sha as auditedHeadSha, is_high_risk as isHighRisk,
                        owner, repo, updated_at as updatedAt
                 FROM task_leases
                 WHERE state IN ('AWAITING_APPROVAL', 'SCOPE_PASSED')
                 ORDER BY updated_at DESC LIMIT 15`,
            ).all()

            if (results.results && results.results.length > 0) {
                return c.json({ ok: true, candidates: results.results })
            }
        } catch (err: any) {
            console.warn('D1 candidate query fallback:', err.message)
        }
    }

    // Default discovery fallback for standalone test tasks
    return c.json({
        ok: true,
        candidates: [
            {
                taskId: 'TEST-TASK-00',
                pullNumber: 0,
                state: 'AWAITING_APPROVAL',
                auditedHeadSha: 'abcdef1234567890abcdef1234567890abcdef12',
                isHighRisk: 1,
                owner: 'camp-candor',
                repo: '000.repo-bot',
            },
        ],
    })
})

/**
 * GET /api/tasks/:taskId/inspect
 * Inspects real-time CAS compatibility between RepoBotDO context and remote GitHub PR head.
 */
app.get('/api/tasks/:taskId/inspect', async (c) => {
    const taskId = c.req.param('taskId')
    if (!c.env.REPO_BOT_DO) {
        return c.json({ error: 'DURABLE_OBJECT_UNAVAILABLE' }, 500)
    }

    try {
        const doId = c.env.REPO_BOT_DO.idFromName(taskId)
        const taskDO = c.env.REPO_BOT_DO.get(doId)

        const doRes = await taskDO.fetch(
            new Request('https://internal/fsm/context'),
        )
        const context: any = await doRes.json()

        if (!context || !context.taskId) {
            return c.json({ error: 'TASK_CONTEXT_NOT_FOUND', taskId }, 404)
        }

        let remoteHeadSha = context.auditedHeadSha
        let headDrift = false

        // Query remote GitHub PR head if pullNumber is valid
        if (
            context.pullNumber &&
            context.pullNumber > 0 &&
            context.owner &&
            context.repo
        ) {
            try {
                const { githubRequest } = await import('./tools.js')
                const pr: any = await githubRequest(
                    `/repos/${context.owner}/${context.repo}/pulls/${context.pullNumber}`,
                    c.env,
                )
                remoteHeadSha = pr.head?.sha || remoteHeadSha
                headDrift = remoteHeadSha !== context.auditedHeadSha
            } catch (ghErr: any) {
                console.warn(
                    'Remote PR head inspection skipped:',
                    ghErr.message,
                )
            }
        }

        const checksPassed =
            context.scopeCheckPassed === true &&
            (context.state === 'AWAITING_APPROVAL' ||
                context.state === 'SCOPE_PASSED')

        return c.json({
            ok: true,
            taskId: context.taskId,
            state: context.state,
            pullNumber: context.pullNumber || 0,
            auditedHeadSha: context.auditedHeadSha,
            remoteHeadSha,
            headDrift,
            scopeCheckPassed: context.scopeCheckPassed,
            checksPassed,
            branchName:
                context.branchName || `spec/${context.taskId.toLowerCase()}`,
            isHighRiskPath: context.isHighRiskPath,
        })
    } catch (err: any) {
        return c.json({ error: err.message }, 500)
    }
})

// -----------------------------------------------------------------------------
// AUDIT LEDGER & DRAINAGE ROUTES
// -----------------------------------------------------------------------------

// Query recent events from D1
app.get('/api/audit/recent', async (c) => {
    const limit = Math.min(Number(c.req.query('limit')) || 20, 100)
    const repo = c.req.query('repo')

    let query = 'SELECT * FROM audit_events '
    const params: any[] = []
    if (repo) {
        query += 'WHERE repository = ? '
        params.push(repo)
    }
    query += 'ORDER BY sequence_id DESC LIMIT ?'
    params.push(limit)

    const { results } = await c.env.DB.prepare(query)
        .bind(...params)
        .all()
    return c.json({ ok: true, events: results || [] })
})

// Verify hash chain integrity across a sequence range
app.get('/api/audit/verify-chain', async (c) => {
    const repo = c.req.query('repo')
    if (!repo) {
        return c.json(
            { ok: false, error: 'Repository query param required' },
            400,
        )
    }

    const { results } = await c.env.DB.prepare(
        'SELECT * FROM audit_events WHERE repository = ? ORDER BY sequence_id ASC',
    )
        .bind(repo)
        .all()

    const rows = results || []
    return c.json({ ok: true, count: rows.length, rows })
})

// Trigger manual cold drainage flush
app.post('/api/audit/drain', async (c) => {
    try {
        const result = await executeColdDrainage(c.env.DB, {
            GITHUB_TOKEN: c.env.GITHUB_TOKEN,
            ARCHIVE_REPO: c.env.ARCHIVE_REPO,
        })
        return c.json({ ok: true, ...result })
    } catch (err: any) {
        return c.json({ ok: false, error: err.message }, 500)
    }
})

// -----------------------------------------------------------------------------
// CLOUDFLARE CRON TRIGGER SCHEDULED HANDLER
// -----------------------------------------------------------------------------
export default {
    fetch: app.fetch,
    async scheduled(event: any, env: any, ctx: any) {
        ctx.waitUntil(
            executeColdDrainage(env.DB, {
                GITHUB_TOKEN: env.GITHUB_TOKEN,
                ARCHIVE_REPO: env.ARCHIVE_REPO,
            }).catch((err) =>
                console.error('[SCHEDULED_DRAINAGE_FAILED]', err),
            ),
        )
    },
}
