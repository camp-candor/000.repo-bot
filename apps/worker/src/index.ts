import { Hono } from 'hono'
import { createAgentWorker } from '@funtuantw/pi-agent-cf'
import {
    type Env,
    createGetCommitShaTool,
    createEphemeralBranchTool,
    createWriteRepoFileTool,
    createPullRequestTool,
    createInspectRepoChecksTool,
    fetchRepoChecks,
} from './tools.js'

export * from './tools.js'

// ============================================================================
// [ REPO-BOT: EDGE DEVOPS & ORCHESTRATION CONTROL PLANE ]
// ============================================================================

// ----------------------------------------------------------------------------
// 🧠 SYSTEM PROMPT & CLOUDFLARE AI GATEWAY CONFIGURATION
// ----------------------------------------------------------------------------

const cfModel: any = {
    id: '@hf/nousresearch/hermes-2-pro-mistral-7b',
    api: 'openai-completions',
    provider: 'openai',
    baseUrl: '', // Set dynamically via Cloudflare AI Gateway
    reasoning: false,
    input: ['text'],
    temperature: 0.1,
    compat: {
        supportsStore: false,
        supportsDeveloperRole: false,
        supportsStrictMode: false,
    },
}

const dynamicWorker = createAgentWorker<Env>({
    systemPrompt: (env) => {
        const gatewaySlug = env.CLOUDFLARE_AI_GATEWAY || 'repo-bot-gateway'
        cfModel.baseUrl = `https://gateway.ai.cloudflare.com/v1/${env.CLOUDFLARE_ACCOUNT_ID}/${gatewaySlug}/workers-ai/v1`

        return `
You are repo-bot, the deterministic DevOps Control Plane and Git Mechanic for the studio ecosystem.
You coordinate workspace isolation, branch scaffolding, spec commits, and PR generation.

GOVERNING RULES:
1. THE ANCHOR INVARIANT: Before modifying or cutting branches, you MUST capture the base commit SHA (S_clean) using 'get_commit_sha'.
2. WORKSPACE ISOLATION: Never commit directly to 'main'. Always provision an ephemeral branch prefixed with 'spec/' using 'create_ephemeral_branch'.
3. BOUNDED MUTATION: Only write files explicitly requested. Always read receipts from tools before narrating outcomes.
4. ZERO VIBE TOLERANCE: Output concrete commit hashes, branch refs, and PR URLs. Do not invent fictional repositories or pretend actions succeeded without a tool receipt.
5. REPO CI INSPECTION: When requested to inspect repository CI check runs or test outcomes, use 'inspect_repo_checks'. Return the structured JSON matching commit details and checks without markdown fluff.
    `.trim()
    },
    model: cfModel,
    tools: (env) => [
        createGetCommitShaTool(env),
        createEphemeralBranchTool(env),
        createWriteRepoFileTool(env),
        createPullRequestTool(env),
        createInspectRepoChecksTool(env),
    ],
    getApiKey: (provider, env) => {
        if (provider === 'openai') return env.CLOUDFLARE_API_TOKEN
        return undefined
    },
})

// ----------------------------------------------------------------------------
// 🎚️ ROUTER & DIAGNOSTICS
// ----------------------------------------------------------------------------

const app = new Hono<{ Bindings: Env }>()

app.get('/', (c) => c.text('REPO-BOT EDGE CONTROL PLANE IS LIVE.'))

app.get('/health', async (c) => {
    return c.json({
        status: 'healthy',
        hasGithubToken: Boolean(c.env.GITHUB_TOKEN),
        hasAccountId: Boolean(c.env.CLOUDFLARE_ACCOUNT_ID),
        aiGateway: c.env.CLOUDFLARE_AI_GATEWAY || 'repo-bot-gateway',
    })
})

app.get('/repobot/inspect', async (c) => {
    try {
        const owner = c.req.query('owner') || 'camp-candor'
        const repo = c.req.query('repo') || '000.repo-bot'
        const data = await fetchRepoChecks(owner, repo, c.env)
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
        const data = await fetchRepoChecks(owner, repo, c.env)
        return c.json(data)
    } catch (error: any) {
        return c.json({ error: error.message }, 500)
    }
})

app.get('/oracle', async (c) => {
    try {
        const prompt = c.req.query('prompt') || 'Inspect repository status'
        const gatewayId = c.env.CLOUDFLARE_AI_GATEWAY || 'repo-bot-gateway'

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

// Session routing (/sessions, /sessions/:id/prompt, /sessions/:id/ws)
app.all('/*', async (c) => {
    if (!dynamicWorker.handler.fetch) return c.text('Handler missing', 500)
    return await dynamicWorker.handler.fetch(
        c.req.raw as any,
        c.env,
        c.executionCtx,
    )
})

export const AgentSessionDO = dynamicWorker.AgentSessionDO
export default app
