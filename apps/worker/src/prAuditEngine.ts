import type { Context } from 'hono'
import { githubRequest, type Env } from './tools.js'

export interface GitHubPullRequestFile {
    filename: string
    previous_filename?: string
    status: string
    additions: number
    deletions: number
    changes: number
}

export interface AuditResult {
    passed: boolean
    sha: string
    totalFiles: number
    violations: string[]
    description: string
}

// ----------------------------------------------------------------------------
// 🛡️ STRUCTURAL FIREWALL RULES (POSIX-Anchored Regex)
// ----------------------------------------------------------------------------

export const PROTECTED_PATTERNS: RegExp[] = [
    /^\.github\//i, // CI workflows & actions
    /(^|\/)tests?\//i, // Test directories
    /(^|\/)[^/]+\.test\.[a-zA-Z0-9]+$/i, // Test files (*.test.ts, *.test.js)
    /(^|\/)[^/]+\.spec\.[a-zA-Z0-9]+$/i, // Spec files (*.spec.ts)
    /(^|\/)package(-lock)?\.json$/i, // Root & package manifests
    /(^|\/)pnpm-lock\.yaml$/i, // Lockfiles
    /(^|\/)tsconfig.*\.json$/i, // TypeScript configurations
    /(^|\/)vitest.*\.config\.[a-zA-Z0-9]+$/i, // Test runner configurations
    /(^|\/)eslint\.config\.[a-zA-Z0-9]+$/i, // Linter configurations
]

export const MAX_BLAST_RADIUS_FILES = 50

export function normalizePath(pathStr: string): string {
    return pathStr.replace(/\\/g, '/').replace(/^\/+/, '').trim()
}

export function hasTraversal(pathStr: string): boolean {
    const parts = pathStr.split('/')
    return parts.includes('..') || parts.includes('.')
}

export function isProtectedPath(pathStr: string): boolean {
    const normalized = normalizePath(pathStr)
    return PROTECTED_PATTERNS.some((pattern) => pattern.test(normalized))
}

export function extractWhitelist(
    bodyText: string | null | undefined,
): string[] | null {
    if (!bodyText) return null

    // Pattern A: Embedded HTML comment: <!-- file_whitelist: ["path1", "path2"] -->
    const commentMatch = bodyText.match(
        /<!--\s*file_whitelist:\s*(\[.*?\])\s*-->/s,
    )
    if (commentMatch && commentMatch[1]) {
        try {
            const parsed = JSON.parse(commentMatch[1])
            if (Array.isArray(parsed)) {
                return parsed.map((p) => normalizePath(String(p)))
            }
        } catch {}
    }

    // Pattern B: Markdown header ## Whitelist
    const sectionMatch = bodyText.match(
        /##\s*(?:Scope\s*)?Whitelist\s*([\s\S]*?)(?:\n##|$)/i,
    )
    if (sectionMatch && sectionMatch[1]) {
        const lines = sectionMatch[1].split('\n')
        const paths: string[] = []
        for (const line of lines) {
            const clean = line.replace(/^[\s*-]+/, '').trim()
            const codeMatch = clean.match(/^`([^`]+)`/)
            if (codeMatch && codeMatch[1]) {
                paths.push(normalizePath(codeMatch[1]))
            } else if (
                clean &&
                !clean.startsWith('#') &&
                !clean.startsWith('<!--')
            ) {
                paths.push(normalizePath(clean))
            }
        }
        if (paths.length > 0) return paths
    }

    return null
}

export async function postCommitStatus(
    owner: string,
    repo: string,
    sha: string,
    state: 'pending' | 'success' | 'failure' | 'error',
    description: string,
    env: Env,
) {
    try {
        await githubRequest(`/repos/${owner}/${repo}/statuses/${sha}`, env, {
            method: 'POST',
            body: JSON.stringify({
                state,
                description: description.slice(0, 140),
                context: 'repo-bot/scope-check',
            }),
        })
    } catch (err: any) {
        console.error(
            `Failed to post commit status to ${owner}/${repo}@${sha}:`,
            err.message,
        )
    }
}

export async function fetchAllPullRequestFiles(
    owner: string,
    repo: string,
    pullNumber: number,
    env: Env,
): Promise<GitHubPullRequestFile[]> {
    const files: GitHubPullRequestFile[] = []
    let page = 1
    const perPage = 100

    while (true) {
        const endpoint = `/repos/${owner}/${repo}/pulls/${pullNumber}/files?per_page=${perPage}&page=${page}`
        const batch: any = await githubRequest(endpoint, env)

        if (!Array.isArray(batch) || batch.length === 0) break

        files.push(...batch)
        if (batch.length < perPage) break
        page++
    }

    return files
}

export async function auditPullRequest(
    owner: string,
    repo: string,
    pullNumber: number,
    headSha: string,
    prBody: string | null | undefined,
    env: Env,
): Promise<AuditResult> {
    await postCommitStatus(
        owner,
        repo,
        headSha,
        'pending',
        'Verifying diff scope against allowlist...',
        env,
    )

    let files: GitHubPullRequestFile[] = []
    try {
        files = await fetchAllPullRequestFiles(owner, repo, pullNumber, env)
    } catch (err: any) {
        const desc = `Diff retrieval failed: ${err.message}`
        await postCommitStatus(owner, repo, headSha, 'error', desc, env)
        return {
            passed: false,
            sha: headSha,
            totalFiles: 0,
            violations: [desc],
            description: desc,
        }
    }

    const violations: string[] = []

    if (files.length > MAX_BLAST_RADIUS_FILES) {
        violations.push(
            `Blast-radius ceiling breached: ${files.length} files changed (max allowed: ${MAX_BLAST_RADIUS_FILES})`,
        )
    }

    const whitelist = extractWhitelist(prBody)
    const normalizedWhitelist = whitelist
        ? new Set(whitelist.map(normalizePath))
        : null

    for (const file of files) {
        const currentPath = normalizePath(file.filename)
        const previousPath = file.previous_filename
            ? normalizePath(file.previous_filename)
            : null

        if (
            hasTraversal(currentPath) ||
            (previousPath && hasTraversal(previousPath))
        ) {
            violations.push(
                `Directory traversal attempt detected: ${file.filename}`,
            )
            continue
        }

        if (isProtectedPath(currentPath)) {
            violations.push(
                `Mutating protected asset is forbidden: ${currentPath}`,
            )
        }

        if (previousPath && isProtectedPath(previousPath)) {
            violations.push(
                `Renaming or moving protected asset is forbidden: ${previousPath}`,
            )
        }

        if (normalizedWhitelist) {
            const isCurrentWhitelisted = normalizedWhitelist.has(currentPath)
            const isPreviousWhitelisted =
                !previousPath || normalizedWhitelist.has(previousPath)

            if (!isCurrentWhitelisted || !isPreviousWhitelisted) {
                violations.push(
                    `File is outside declared task whitelist: ${currentPath}`,
                )
            }
        }
    }

    const passed = violations.length === 0
    const description = passed
        ? `Scope verified: ${files.length} file(s) within allowlist`
        : `SECURITY_VIOLATION: ${violations[0]}`

    await postCommitStatus(
        owner,
        repo,
        headSha,
        passed ? 'success' : 'failure',
        description,
        env,
    )

    return {
        passed,
        sha: headSha,
        totalFiles: files.length,
        violations,
        description,
    }
}

export const handleGitHubWebhook = async (c: Context<{ Bindings: Env }>) => {
    const signature = c.req.header('X-Hub-Signature-256')
    const event = c.req.header('X-GitHub-Event')
    const deliveryId = c.req.header('X-GitHub-Delivery')

    if (c.env.GITHUB_WEBHOOK_SECRET) {
        if (!signature) {
            return c.json({ error: 'MISSING_SIGNATURE' }, 401)
        }

        const bodyText = await c.req.text()
        const encoder = new TextEncoder()
        const key = await crypto.subtle.importKey(
            'raw',
            encoder.encode(c.env.GITHUB_WEBHOOK_SECRET),
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['verify'],
        )

        const sigHex = signature.startsWith('sha256=')
            ? signature.slice(7)
            : signature
        const sigBytes = new Uint8Array(
            sigHex.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || [],
        )

        const isValid = await crypto.subtle.verify(
            'HMAC',
            key,
            sigBytes,
            encoder.encode(bodyText),
        )

        if (!isValid) {
            return c.json({ error: 'INVALID_SIGNATURE' }, 401)
        }

        let payload: any = {}
        try {
            payload = JSON.parse(bodyText)
        } catch {
            return c.json({ error: 'INVALID_JSON_PAYLOAD' }, 400)
        }

        if (event === 'pull_request') {
            const action = payload.action
            const pr = payload.pull_request
            const repo = payload.repository

            if (
                ['opened', 'synchronize', 'reopened'].includes(action) &&
                pr &&
                repo
            ) {
                const owner = repo.owner?.login
                const repoName = repo.name
                const prNumber = pr.number
                const headSha = pr.head?.sha
                const prBody = pr.body

                c.executionCtx.waitUntil(
                    auditPullRequest(
                        owner,
                        repoName,
                        prNumber,
                        headSha,
                        prBody,
                        c.env,
                    ),
                )

                return c.json(
                    {
                        status: 'AUDIT_DISPATCHED',
                        deliveryId,
                        pr: prNumber,
                        sha: headSha,
                    },
                    202,
                )
            }
        }

        return c.json({ status: 'ACCEPTED', event, deliveryId }, 202)
    }

    return c.json({ status: 'RECEIVED', event, deliveryId }, 200)
}
