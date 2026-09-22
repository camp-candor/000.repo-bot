import { type Context } from 'hono'
import { githubRequest, type Env } from './tools.js'

export const PROTECTED_PATHS = [
    '.github/workflows/',
    'apps/995.library/',
    'package.json',
    'tests/',
]

export interface AuditResult {
    passed: boolean
    violations: string[]
    inspectedFiles: string[]
}

/**
 * Constant-time HMAC-SHA256 verification using Web Crypto API (crypto.subtle)
 */
export async function verifyGitHubWebhookHmac(
    body: ArrayBuffer,
    signatureHeader: string | null,
    secret: string,
): Promise<boolean> {
    if (!signatureHeader || !secret) return false

    const encoder = new TextEncoder()
    const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify'],
    )

    const sigHex = signatureHeader.replace(/^sha256=/, '').trim()
    if (sigHex.length !== 64) return false

    const sigBytes = new Uint8Array(
        sigHex.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || [],
    )

    return await crypto.subtle.verify('HMAC', key, sigBytes, body)
}

/**
 * Fetch all modified files in a PR using GitHub REST API with pagination
 */
export async function fetchAllPullRequestFiles(
    owner: string,
    repo: string,
    pullNumber: number,
    env: Env,
): Promise<
    Array<{ filename: string; previous_filename?: string; status: string }>
> {
    const allFiles: Array<{
        filename: string
        previous_filename?: string
        status: string
    }> = []
    let page = 1
    const perPage = 100

    while (true) {
        const files: any = await githubRequest(
            `/repos/${owner}/${repo}/pulls/${pullNumber}/files?per_page=${perPage}&page=${page}`,
            env,
        )

        if (!Array.isArray(files) || files.length === 0) {
            break
        }

        allFiles.push(...files)

        if (files.length < perPage) {
            break
        }
        page++
    }

    return allFiles
}

/**
 * Audit PR files against hardcoded protected paths and optional file whitelist
 */
export function auditDiffFiles(
    files: Array<{ filename: string; previous_filename?: string }>,
    whitelist?: string[],
): AuditResult {
    const violations: string[] = []
    const inspectedFiles: string[] = []

    for (const file of files) {
        const candidates = [file.filename]
        if (file.previous_filename) {
            candidates.push(file.previous_filename)
        }

        for (const candidate of candidates) {
            inspectedFiles.push(candidate)

            // Check hard-coded protected paths
            const isProtected = PROTECTED_PATHS.some(
                (p) =>
                    candidate.startsWith(p) ||
                    candidate === p.replace(/\/$/, ''),
            )
            if (isProtected) {
                violations.push(
                    `Forbidden mutation of protected path: ${candidate}`,
                )
                continue
            }

            // Check against file whitelist if provided
            if (whitelist && whitelist.length > 0) {
                const isWhitelisted = whitelist.some(
                    (allowed) =>
                        candidate === allowed || candidate.startsWith(allowed),
                )
                if (!isWhitelisted) {
                    violations.push(`File outside whitelist: ${candidate}`)
                }
            }
        }
    }

    return {
        passed: violations.length === 0,
        violations,
        inspectedFiles,
    }
}

/**
 * Post a commit status / check run result back to GitHub
 */
export async function postScopeCheckStatus(
    owner: string,
    repo: string,
    sha: string,
    state: 'success' | 'failure' | 'error',
    description: string,
    env: Env,
) {
    return await githubRequest(`/repos/${owner}/${repo}/statuses/${sha}`, env, {
        method: 'POST',
        body: JSON.stringify({
            state,
            context: 'repo-bot/scope-check',
            description: description.slice(0, 140),
        }),
    })
}

/**
 * Handle incoming GitHub Webhooks (e.g. POST /webhooks/github)
 */
export async function handleGitHubWebhook(c: Context<{ Bindings: Env }>) {
    const secret = c.env.GITHUB_WEBHOOK_SECRET
    const bodyBuffer = await c.req.raw.clone().arrayBuffer()

    if (secret) {
        const sig = c.req.header('x-hub-signature-256') || null
        const isValid = await verifyGitHubWebhookHmac(bodyBuffer, sig, secret)
        if (!isValid) {
            return c.text('Unauthorized: Invalid HMAC signature', 401)
        }
    }

    let payload: any
    try {
        const text = new TextDecoder().decode(bodyBuffer)
        payload = JSON.parse(text)
    } catch {
        return c.text('Invalid JSON payload', 400)
    }

    const event = c.req.header('x-github-event')
    if (event === 'pull_request') {
        const action = payload.action
        if (
            action === 'opened' ||
            action === 'synchronize' ||
            action === 'reopened'
        ) {
            const pr = payload.pull_request
            const repoFullName = payload.repository?.full_name || ''
            const [owner, repo] = repoFullName.split('/')
            const headSha = pr.head?.sha

            if (!owner || !repo || !pr.number) {
                return c.json(
                    { error: 'Missing pull_request repository details' },
                    400,
                )
            }

            try {
                const files = await fetchAllPullRequestFiles(
                    owner,
                    repo,
                    pr.number,
                    c.env,
                )
                const audit = auditDiffFiles(files)

                if (headSha && c.env.GITHUB_TOKEN) {
                    await postScopeCheckStatus(
                        owner,
                        repo,
                        headSha,
                        audit.passed ? 'success' : 'failure',
                        audit.passed
                            ? 'Scope check passed: No protected files modified'
                            : `Scope check failed: ${audit.violations[0]}`,
                        c.env,
                    )
                }

                if (!audit.passed) {
                    return c.json(
                        {
                            audit: 'FAILED',
                            violations: audit.violations,
                        },
                        403,
                    )
                }

                return c.json({
                    audit: 'PASSED',
                    inspectedFiles: audit.inspectedFiles,
                })
            } catch (err: any) {
                return c.json({ error: err.message }, 500)
            }
        }
    }

    return c.json({ received: true, event })
}
