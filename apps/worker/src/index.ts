import { Hono } from 'hono'
import { generateCommitMessage } from './commitGenerator.js'
import { dispatchJulesJob, getJulesSession } from './jules.js'
import { handleGitHubWebhook } from './prAuditEngine.js'
import {
    inspectRepoChecksViaAiGateway,
    getGatewaySlug,
    type Env,
} from './tools.js'
import { RepoBotDO } from './RepoBotDO.js'

export { RepoBotDO }
export * from './tools.js'

const app = new Hono<{ Bindings: Env }>()

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

        const response = await c.env.AI.run(
            '@cf/meta/llama-3.2-3b-instruct',
            {
                messages: [
                    {
                        role: 'user',
                        content: `${prompt}. Output ONLY raw JSON.`,
                    },
                ],
            },
            {
                gateway: {
                    id: gatewayId,
                    skipCache: false,
                    cacheTtl: 3600,
                },
            },
        )

        return c.text(response.response || JSON.stringify(response))
    } catch (error: any) {
        console.error('Oracle Error:', error)
        return c.text(`Error: ${error.message}`, 500)
    }
})

// Clean REST mounts replacing @funtuantw/pi-agent-cf
app.post('/api/commit-message', generateCommitMessage)
app.post('/api/jules/dispatch', dispatchJulesJob)
app.get('/api/jules/session/:id', getJulesSession)
app.post('/webhooks/github', handleGitHubWebhook)

export default app
