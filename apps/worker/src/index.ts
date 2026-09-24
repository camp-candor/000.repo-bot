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

export default app
