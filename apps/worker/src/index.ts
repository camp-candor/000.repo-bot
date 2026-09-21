import { Hono } from 'hono'
import {
    createAgentWorker,
    type AgentEnv,
    type AgentTool,
} from '@funtuantw/pi-agent-cf'
import { Type, type Static } from '@sinclair/typebox'

// ============================================================================
// [ REPO-BOT: EDGE DEVOPS & ORCHESTRATION CONTROL PLANE ]
// ============================================================================

export interface Env extends AgentEnv {
    CLOUDFLARE_ACCOUNT_ID: string
    CLOUDFLARE_API_TOKEN: string
    CLOUDFLARE_AI_GATEWAY: string // Gateway slug (e.g., "repo-bot-gateway")
    GITHUB_TOKEN: string // Token loaded from .env / .dev.vars
    GITHUB_DEFAULT_OWNER?: string
    AI: any // Cloudflare Workers AI binding
}

// Helper: GitHub REST API fetcher with deterministic headers
async function githubRequest(
    endpoint: string,
    env: Env,
    options: RequestInit = {},
) {
    const url = `https://api.github.com${endpoint}`
    const response = await fetch(url, {
        ...options,
        headers: {
            'Accept': 'application/vnd.github+json',
            'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'repo-bot-edge-isolate',
            'Content-Type': 'application/json',
            ...(options.headers || {}),
        },
    })

    const data = await response.json()
    if (!response.ok) {
        throw new Error(
            `GitHub API error (${response.status}): ${(data as any).message || JSON.stringify(data)}`,
        )
    }
    return data
}

// ----------------------------------------------------------------------------
// 🎛️ DETERMINISTIC TOOLS (TypeBox additionalProperties: false)
// ----------------------------------------------------------------------------

// TOOL 1: Capture HEAD SHA (S_clean anchor)
const GetCommitShaParams = Type.Object(
    {
        owner: Type.String({ description: 'GitHub organization or username' }),
        repo: Type.String({ description: 'Repository name' }),
        branch: Type.String({
            description: 'Branch name to inspect (e.g., main or staging)',
            default: 'main',
        }),
    },
    { additionalProperties: false },
)

const createGetCommitShaTool = (
    env: Env,
): AgentTool<typeof GetCommitShaParams> => ({
    name: 'get_commit_sha',
    label: 'Get Branch Commit SHA (S_clean)',
    description:
        'REQUIRED: Queries the HEAD commit SHA of a target branch to capture the immutable rollback anchor (S_clean) before provisioning changes.',
    parameters: GetCommitShaParams,
    execute: async (_id: any, args: Static<typeof GetCommitShaParams>) => {
        try {
            const data: any = await githubRequest(
                `/repos/${args.owner}/${args.repo}/git/ref/heads/${args.branch}`,
                env,
            )
            const sha = data.object.sha

            const receipt = JSON.stringify({
                action: 'COMMIT_SHA_CAPTURED',
                repo: `${args.owner}/${args.repo}`,
                branch: args.branch,
                s_clean: sha,
            })

            return {
                content: [{ type: 'text', text: receipt }],
                details: { sha, branch: args.branch },
            }
        } catch (err: any) {
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            error: err.message,
                            status: 'FAILED',
                        }),
                    },
                ],
                details: { error: err.message },
            }
        }
    },
})

// TOOL 2: Cut Ephemeral Branch (spec/TASK-XX-<short-sha>)
const CreateEphemeralBranchParams = Type.Object(
    {
        owner: Type.String({ description: 'GitHub organization or username' }),
        repo: Type.String({ description: 'Repository name' }),
        branch_name: Type.String({
            description:
                'Ephemeral branch name (MUST follow spec/TASK-XX-<short-sha>)',
        }),
        base_sha: Type.String({
            description: 'The S_clean commit SHA anchoring this branch',
        }),
    },
    { additionalProperties: false },
)

const createEphemeralBranchTool = (
    env: Env,
): AgentTool<typeof CreateEphemeralBranchParams> => ({
    name: 'create_ephemeral_branch',
    label: 'Create Ephemeral Branch',
    description:
        'Creates an isolated branch anchored to a specific commit SHA. Never allows direct mutation of main.',
    parameters: CreateEphemeralBranchParams,
    execute: async (
        _id: any,
        args: Static<typeof CreateEphemeralBranchParams>,
    ) => {
        try {
            const ref = args.branch_name.startsWith('refs/heads/')
                ? args.branch_name
                : `refs/heads/${args.branch_name}`

            const data: any = await githubRequest(
                `/repos/${args.owner}/${args.repo}/git/refs`,
                env,
                {
                    method: 'POST',
                    body: JSON.stringify({
                        ref,
                        sha: args.base_sha,
                    }),
                },
            )

            const receipt = JSON.stringify({
                action: 'EPHEMERAL_BRANCH_CREATED',
                ref: data.ref,
                anchored_sha: args.base_sha,
            })

            return {
                content: [{ type: 'text', text: receipt }],
                details: { ref: data.ref, sha: args.base_sha },
            }
        } catch (err: any) {
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            error: err.message,
                            status: 'FAILED',
                        }),
                    },
                ],
                details: { error: err.message },
            }
        }
    },
})

// TOOL 3: Bounded File Commit
const WriteRepoFileParams = Type.Object(
    {
        owner: Type.String({ description: 'GitHub organization or username' }),
        repo: Type.String({ description: 'Repository name' }),
        path: Type.String({
            description: 'Repository file path (e.g., docs/specs/TASK-01.md)',
        }),
        content: Type.String({
            description: 'UTF-8 string content to write to the file',
        }),
        commit_message: Type.String({
            description:
                'Conventional commit message (e.g., chore(spec): add TASK-01)',
        }),
        branch: Type.String({
            description: 'Target branch name (MUST be an ephemeral branch)',
        }),
        sha: Type.Optional(
            Type.String({
                description:
                    'Existing file blob SHA if updating an existing file; omit if creating',
            }),
        ),
    },
    { additionalProperties: false },
)

const createWriteRepoFileTool = (
    env: Env,
): AgentTool<typeof WriteRepoFileParams> => ({
    name: 'write_repo_file',
    label: 'Write or Update Repo File',
    description:
        'Writes or updates a bounded file on a specific branch via GitHub Contents API. Encodes content to base64.',
    parameters: WriteRepoFileParams,
    execute: async (_id: any, args: Static<typeof WriteRepoFileParams>) => {
        try {
            const base64Content = btoa(
                unescape(encodeURIComponent(args.content)),
            )

            const body: Record<string, any> = {
                message: args.commit_message,
                content: base64Content,
                branch: args.branch,
            }
            if (args.sha) body.sha = args.sha

            const data: any = await githubRequest(
                `/repos/${args.owner}/${args.repo}/contents/${args.path}`,
                env,
                {
                    method: 'PUT',
                    body: JSON.stringify(body),
                },
            )

            const receipt = JSON.stringify({
                action: 'FILE_COMMITTED',
                path: args.path,
                branch: args.branch,
                commit_sha: data.commit.sha,
            })

            return {
                content: [{ type: 'text', text: receipt }],
                details: { commit_sha: data.commit.sha, path: args.path },
            }
        } catch (err: any) {
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            error: err.message,
                            status: 'FAILED',
                        }),
                    },
                ],
                details: { error: err.message },
            }
        }
    },
})

// TOOL 4: Open Pull Request
const CreatePullRequestParams = Type.Object(
    {
        owner: Type.String({ description: 'GitHub organization or username' }),
        repo: Type.String({ description: 'Repository name' }),
        title: Type.String({ description: 'PR Title' }),
        body: Type.String({
            description:
                'Detailed description, linked spec, and scope invariants',
        }),
        head_branch: Type.String({
            description: 'Source branch containing candidate commits',
        }),
        base_branch: Type.String({
            description: 'Target branch (e.g., main)',
            default: 'main',
        }),
    },
    { additionalProperties: false },
)

const createPullRequestTool = (
    env: Env,
): AgentTool<typeof CreatePullRequestParams> => ({
    name: 'create_pull_request',
    label: 'Create Pull Request',
    description:
        'Opens a GitHub Pull Request from an ephemeral branch to trunk for automated gauntlet validation and audit review.',
    parameters: CreatePullRequestParams,
    execute: async (_id: any, args: Static<typeof CreatePullRequestParams>) => {
        try {
            const data: any = await githubRequest(
                `/repos/${args.owner}/${args.repo}/pulls`,
                env,
                {
                    method: 'POST',
                    body: JSON.stringify({
                        title: args.title,
                        body: args.body,
                        head: args.head_branch,
                        base: args.base_branch || 'main',
                    }),
                },
            )

            const receipt = JSON.stringify({
                action: 'PULL_REQUEST_OPENED',
                pr_number: data.number,
                html_url: data.html_url,
                head: args.head_branch,
                base: args.base_branch,
            })

            return {
                content: [{ type: 'text', text: receipt }],
                details: { pr_number: data.number, url: data.html_url },
            }
        } catch (err: any) {
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            error: err.message,
                            status: 'FAILED',
                        }),
                    },
                ],
                details: { error: err.message },
            }
        }
    },
})

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
    `.trim()
    },
    model: cfModel,
    tools: (env) => [
        createGetCommitShaTool(env),
        createEphemeralBranchTool(env),
        createWriteRepoFileTool(env),
        createPullRequestTool(env),
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

app.get('/oracle', async (c) => {
    try {
        const prompt = c.req.query('prompt') || 'Inspect repository status'
        const gatewayId = c.env.CLOUDFLARE_AI_GATEWAY || 'repo-bot-gateway'

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
    return await dynamicWorker.handler.fetch(c.req.raw as any, c.env, c.executionCtx)
})

export const AgentSessionDO = dynamicWorker.AgentSessionDO
export default app
