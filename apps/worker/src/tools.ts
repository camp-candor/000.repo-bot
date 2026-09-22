import type { AgentEnv, AgentTool } from '@funtuantw/pi-agent-cf'
import { Type, type Static } from '@sinclair/typebox'

// ============================================================================
// [ REPO-BOT: DETERMINISTIC DEVOPS & GIT TOOLS ]
// ============================================================================

export interface Env extends AgentEnv {
    CLOUDFLARE_ACCOUNT_ID: string
    CLOUDFLARE_API_TOKEN: string
    CLOUDFLARE_AI_GATEWAY: string // Gateway slug (e.g., "default")
    CLOUDFLARE_AI_GATEWAY_TOKEN?: string // Gateway universal / authenticated token (cfut_...)
    GITHUB_TOKEN: string // Token loaded from .env
    GITHUB_DEFAULT_OWNER?: string
    JULES_API_KEY?: string // Bounded key for Jules cloud VM sessions
    AI: any // Cloudflare Workers AI binding
}

// Helper: GitHub REST API fetcher with deterministic headers
export async function githubRequest(
    endpoint: string,
    env: Env,
    options: RequestInit = {},
) {
    const url = `https://api.github.com${endpoint}`
    const token =
        env.GITHUB_TOKEN ||
        (typeof process !== 'undefined' ? process.env?.GITHUB_TOKEN : undefined)

    if (!token) {
        throw new Error(
            'Missing GITHUB_TOKEN. Ensure GITHUB_TOKEN is set in .env',
        )
    }

    const headers: Record<string, string> = {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'repo-bot-edge-isolate',
        'Content-Type': 'application/json',
        ...((options.headers as Record<string, string>) || {}),
    }

    const response = await fetch(url, {
        ...options,
        headers,
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
export const GetCommitShaParams = Type.Object(
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

export const createGetCommitShaTool = (
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
export const CreateEphemeralBranchParams = Type.Object(
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

export const createEphemeralBranchTool = (
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
export const WriteRepoFileParams = Type.Object(
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

export const createWriteRepoFileTool = (
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
export const CreatePullRequestParams = Type.Object(
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

export const createPullRequestTool = (
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

// TOOL 5: Inspect Repo Checks & CI Outcomes
export const InspectRepoChecksParams = Type.Object(
    {
        owner: Type.String({
            description: 'GitHub organization or username',
            default: 'camp-candor',
        }),
        repo: Type.String({
            description: 'Repository name',
            default: '000.repo-bot',
        }),
    },
    { additionalProperties: false },
)

export async function fetchRepoChecks(owner: string, repo: string, env: Env) {
    // 1. Query GET /repos/{owner}/{repo}/commits?per_page=1 to get the latest commit SHA and message.
    const commitsData: any = await githubRequest(
        `/repos/${owner}/${repo}/commits?per_page=1`,
        env,
    )
    if (!Array.isArray(commitsData) || commitsData.length === 0) {
        throw new Error(`No commits found for ${owner}/${repo}`)
    }
    const latestCommit = commitsData[0]
    const sha = latestCommit.sha
    const message = latestCommit.commit?.message || ''
    const author =
        latestCommit.commit?.author?.name ||
        latestCommit.author?.login ||
        'Unknown'
    const timestamp =
        latestCommit.commit?.author?.date || new Date().toISOString()

    // 2. Query GET /repos/{owner}/{repo}/commits/{sha}/check-runs to evaluate test outcomes.
    const checkRunsData: any = await githubRequest(
        `/repos/${owner}/${repo}/commits/${sha}/check-runs`,
        env,
    )

    const checkRuns: any[] = checkRunsData.check_runs || []
    const totalCount = checkRunsData.total_count ?? checkRuns.length

    // 3. Compute all_passed as true ONLY if every check run has status === "completed" and conclusion === "success".
    const allPassed =
        checkRuns.length > 0 &&
        checkRuns.every(
            (run: any) =>
                run.status === 'completed' && run.conclusion === 'success',
        )

    let status: 'completed' | 'in_progress' | 'queued' = 'completed'
    if (checkRuns.some((run: any) => run.status === 'queued')) {
        status = 'queued'
    } else if (checkRuns.some((run: any) => run.status === 'in_progress')) {
        status = 'in_progress'
    }

    const runs = checkRuns.map((run: any) => ({
        name: run.name || '',
        status: run.status || '',
        conclusion: run.conclusion ?? null,
        details_url: run.details_url || run.html_url || '',
    }))

    return {
        commit: {
            sha,
            message,
            author,
            timestamp,
        },
        checks: {
            all_passed: allPassed,
            total_count: totalCount,
            status,
            runs,
        },
    }
}

export const createInspectRepoChecksTool = (
    env: Env,
): AgentTool<typeof InspectRepoChecksParams> => ({
    name: 'inspect_repo_checks',
    label: 'Inspect Repo Checks',
    description:
        'Inspects the GitHub repository for the latest commit and evaluates CI check-runs outcomes.',
    parameters: InspectRepoChecksParams,
    execute: async (_id: any, args: Static<typeof InspectRepoChecksParams>) => {
        try {
            const data = await fetchRepoChecks(args.owner, args.repo, env)
            return {
                content: [{ type: 'text', text: JSON.stringify(data) }],
                details: data,
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

export const getGatewaySlug = (env: Env): string => {
    if (
        env.CLOUDFLARE_AI_GATEWAY &&
        !env.CLOUDFLARE_AI_GATEWAY.startsWith('cfut_')
    ) {
        return env.CLOUDFLARE_AI_GATEWAY
    }
    return 'default'
}

export const getGatewayToken = (env: Env): string => {
    if (env.CLOUDFLARE_AI_GATEWAY_TOKEN) {
        return env.CLOUDFLARE_AI_GATEWAY_TOKEN
    }
    if (env.CLOUDFLARE_AI_GATEWAY?.startsWith('cfut_')) {
        return env.CLOUDFLARE_AI_GATEWAY
    }
    return env.CLOUDFLARE_API_TOKEN || ''
}

export async function inspectRepoChecksViaAiGateway(
    owner: string,
    repo: string,
    env: Env,
) {
    const rawToolData = await fetchRepoChecks(owner, repo, env)

    const gatewaySlug = getGatewaySlug(env)
    const token = getGatewayToken(env)
    const gatewayUrl = `https://gateway.ai.cloudflare.com/v1/${env.CLOUDFLARE_ACCOUNT_ID}/${gatewaySlug}/workers-ai/v1/chat/completions`

    const payload = {
        model: '@cf/meta/llama-3.2-3b-instruct',
        messages: [
            {
                role: 'system',
                content:
                    'You are repo-bot, the deterministic DevOps Control Plane and Git Mechanic. Return ONLY a valid JSON object without markdown explanation matching the exact structure: {"commit":{"sha":"<string>","message":"<string>","author":"<string>","timestamp":"<ISO 8601 string>"},"checks":{"all_passed":<boolean>,"total_count":<number>,"status":"<completed | in_progress | queued>","runs":[{"name":"<string>","status":"<string>","conclusion":"<string | null>","details_url":"<string>"}]}}',
            },
            {
                role: 'user',
                content: `Inspect GitHub repository CI checks for ${owner}/${repo}.`,
            },
            {
                role: 'assistant',
                content: `Running inspect_repo_checks tool for ${owner}/${repo}.`,
            },
            {
                role: 'user',
                content: `Tool receipt from inspect_repo_checks: ${JSON.stringify(rawToolData)}. Synthesize and return the final JSON payload. Output ONLY the JSON.`,
            },
        ],
    }

    const aiRes = await fetch(gatewayUrl, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    })

    if (!aiRes.ok) {
        const errorText = await aiRes.text()
        throw new Error(
            `Cloudflare AI Gateway error (${aiRes.status}): ${errorText}`,
        )
    }

    const aiJson: any = await aiRes.json()
    const content = aiJson.choices?.[0]?.message?.content || ''

    try {
        const cleaned = content.replace(/```json\s*|\s*```/g, '').trim()
        const parsed = JSON.parse(cleaned)
        if (parsed?.commit?.sha && parsed?.checks) {
            return parsed
        }
    } catch {
        // If formatting was non-strict, fall back to raw verified tool data
    }

    return rawToolData
}
