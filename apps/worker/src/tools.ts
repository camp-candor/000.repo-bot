import { Type } from '@sinclair/typebox'
import type { RepoBotDO } from './RepoBotDO.js'

// ============================================================================
// [ REPO-BOT: DETERMINISTIC DEVOPS & GIT TOOLS ]
// ============================================================================

export interface Env {
    DB?: D1Database
    CLOUDFLARE_ACCOUNT_ID: string
    CLOUDFLARE_API_TOKEN: string
    CLOUDFLARE_AI_GATEWAY: string
    CLOUDFLARE_AI_GATEWAY_TOKEN?: string
    GITHUB_TOKEN: string
    GITHUB_DEFAULT_OWNER?: string
    GH_WEBHOOK_SECRET?: string
    GITHUB_WEBHOOK_SECRET?: string
    JULES_API_KEY?: string
    AI: any
    REPO_BOT_DO: DurableObjectNamespace<RepoBotDO>

    // :: Slack Bridge Credentials (FEAT-04)
    SLACK_BOT_TOKEN?: string
    SLACK_SIGNING_SECRET?: string
    SLACK_CHANNEL_ID?: string // #ops-bridge
    SLACK_JULES_CHANNEL_ID?: string // Dedicated Jules channel: C0C4CK27LA1 (#jules-winnfield)
    SLACK_ASK_JULES_CHANNEL_ID?: string // #ask-jules
    SLACK_AUTHORIZED_APPROVERS?: string // Comma-separated Slack User IDs (e.g. "U01234,U56789")
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

// Inspect Repo Checks & CI Outcomes
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

    const checkRunsData: any = await githubRequest(
        `/repos/${owner}/${repo}/commits/${sha}/check-runs`,
        env,
    )

    const checkRuns: any[] = checkRunsData.check_runs || []
    const totalCount = checkRunsData.total_count ?? checkRuns.length

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
    } catch {}

    return rawToolData
}

/**
 * Verifies GitHub webhook signature using Web Crypto constant-time HMAC-SHA256.
 */
export async function verifyGitHubSignature(
    rawBody: string,
    signatureHeader: string | null | undefined,
    secret: string,
): Promise<boolean> {
    if (!signatureHeader || !secret) {
        return false
    }

    const sigParts = signatureHeader.split('=')
    if (sigParts.length !== 2 || sigParts[0] !== 'sha256') {
        return false
    }
    const signatureHex = sigParts[1]

    const encoder = new TextEncoder()
    const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify'],
    )

    const sigBytes = new Uint8Array(
        signatureHex.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || [],
    )

    return await crypto.subtle.verify(
        'HMAC',
        key,
        sigBytes,
        encoder.encode(rawBody),
    )
}
