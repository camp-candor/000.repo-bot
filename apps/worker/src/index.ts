import { Hono } from 'hono'
import { handleSlackInteraction } from './routes/slackInteractions.js'
import { generateCommitMessage } from './commitGenerator.js'
import { dispatchJulesJob, getJulesSession } from './jules.js'
import { handleGitHubWebhook } from './prAuditEngine.js'
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

const app = new Hono<{ Bindings: Env }>()

const getRepoBotStub = (env: Env) => {
    const id = env.REPO_BOT_DO.idFromName('global-fleet-monitor')
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
app.post('/webhooks/github', handleGitHubWebhook)
app.post('/api/slack/interactions', async (c) => {
    return await handleSlackInteraction(c)
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

// Append these route handlers inside apps/worker/src/index.ts (before export default app)

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

export default app
