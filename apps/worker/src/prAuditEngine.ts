import { handleCheckRunEvent } from './qualityResult.js'
import type { Context } from 'hono'
import { githubRequest, type Env } from './tools.js'

export interface GitHubPullRequestFile {
    filename: string
    previous_filename?: string
    status: string
    additions: number
    deletions: number
    changes: number
    mode?: string
}

export interface AuditResult {
    passed: boolean
    sha: string
    totalFiles: number
    violations: string[]
    description: string
    lineageValid: boolean
}

// ----------------------------------------------------------------------------
// :: ANCHORED STRUCTURAL FIREWALL RULES
// ----------------------------------------------------------------------------

export const PROTECTED_PATTERNS: RegExp[] = [
    /^\.github\//i, // CI workflows, actions, templates
    /(^|\/)tests?\//i, // Test directories (tests/, src/tests/)
    /(^|\/)[^/]+\.test\.[a-zA-Z0-9]+$/i, // Test files (*.test.ts, *.test.tsx, *.test.js)
    /(^|\/)[^/]+\.spec\.[a-zA-Z0-9]+$/i, // Spec files (*.spec.ts, *.spec.tsx)
    /(^|\/)package(-lock)?\.json$/i, // Node manifests & npm lockfiles
    /(^|\/)pnpm-lock\.yaml$/i, // PNPM lockfiles
    /(^|\/)tsconfig(\.[^/]+)?\.json$/i, // TypeScript configurations
    /(^|\/)vitest.*\.config\.[a-zA-Z0-9]+$/i, // Vitest runner configurations
    /(^|\/)\.?eslint(rc)?(\.[^/]+)?$/i, // ESLint configurations
    /(^|\/)Dockerfile$/i, // Container build files
    /(^|\/)wrangler\.(jsonc?|toml)$/i, // Cloudflare Worker infrastructure configs
    /^\.husky\//i, // Git hooks
    /^CODEOWNERS$/i, // Repository governance
    /^benchmarks\/golden_set\//i, // Immutable regression golden sets
]

export const MAX_BLAST_RADIUS_FILES = 50

/**
 * Normalizes file paths to POSIX standard, strips leading slashes and whitespace.
 */
export function normalizePath(pathStr: string): string {
    return pathStr.replace(/\\/g, '/').replace(/^\/+/, '').trim()
}

/**
 * Validates path safety against directory traversal.
 */
export function hasTraversal(pathStr: string): boolean {
    const normalized = normalizePath(pathStr)
    const parts = normalized.split('/')
    return parts.includes('..') || parts.includes('.')
}

/**
 * Checks whether a path intersects with the hard immutable protection set.
 */
export function isProtectedPath(pathStr: string): boolean {
    const normalized = normalizePath(pathStr)
    return PROTECTED_PATTERNS.some((pattern) => pattern.test(normalized))
}

/**
 * Extracts allowed file paths from PR markdown body metadata.
 * Supports: <!-- file_whitelist: ["path1", "path2"] --> or markdown lists under ## Whitelist.
 */
export function extractWhitelist(
    bodyText: string | null | undefined,
): string[] | null {
    if (!bodyText) return null

    // Pattern A: Embedded JSON comment <!-- file_whitelist: ["path1", "path2"] -->
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

    // Pattern B: Markdown header ## Whitelist or ## Scope Whitelist
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

/**
 * Verifies that the pull request does not originate from an external untrusted fork.
 */
export function checkForkIsolation(payload: any): boolean {
    const headRepo = payload.pull_request?.head?.repo?.full_name
    const baseRepo = payload.repository?.full_name
    if (!headRepo || !baseRepo) return false
    return headRepo.toLowerCase() === baseRepo.toLowerCase()
}

/**
 * Verifies commit lineage using GitHub's compare API.
 * Ensures the PR head is strictly 'ahead' of the base commit (anti-force-push defense).
 */
export async function checkLineageIntegrity(
    owner: string,
    repo: string,
    baseSha: string,
    headSha: string,
    env: Env,
): Promise<{ valid: boolean; status: string; reason?: string }> {
    try {
        const endpoint = `/repos/${owner}/${repo}/compare/${baseSha}...${headSha}`
        const comparison: any = await githubRequest(endpoint, env)

        // Status must strictly be 'ahead'
        if (comparison.status === 'ahead') {
            return { valid: true, status: comparison.status }
        }

        return {
            valid: false,
            status: comparison.status || 'unknown',
            reason: `Branch lineage failure: commit status is '${comparison.status}', expected 'ahead'. Force-push or rebase detected.`,
        }
    } catch (err: any) {
        return {
            valid: false,
            status: 'error',
            reason: `Ancestry comparison request failed: ${err.message}`,
        }
    }
}

/**
 * Posts an authoritative commit status check back to GitHub.
 */
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

/**
 * Paginated diff inspector: fetches all files changed by the PR.
 */
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

/**
 * Primary Audit Engine: Evaluates diffs, ancestry, paths, and allowlists outside the agent container.
 */
export async function auditPullRequest(
    owner: string,
    repo: string,
    pullNumber: number,
    headSha: string,
    baseSha: string,
    prBody: string | null | undefined,
    env: Env,
): Promise<AuditResult> {
    // 1. Mark status as pending
    await postCommitStatus(
        owner,
        repo,
        headSha,
        'pending',
        'Verifying diff scope & commit lineage...',
        env,
    )

    const violations: string[] = []

    // 2. Lineage Integrity Audit
    const lineage = await checkLineageIntegrity(
        owner,
        repo,
        baseSha,
        headSha,
        env,
    )
    if (!lineage.valid) {
        violations.push(lineage.reason || 'Ancestry lineage validation failed')
    }

    // 3. Fetch full paginated diff
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
            lineageValid: lineage.valid,
        }
    }

    // 4. Empty-Diff Sentinel Check
    if (files.length === 0) {
        violations.push(
            'Pull request contains zero modified files (vacuous PR)',
        )
    }

    // 5. Blast Radius Ceiling Check
    if (files.length > MAX_BLAST_RADIUS_FILES) {
        violations.push(
            `Blast-radius ceiling breached: ${files.length} files changed (max allowed: ${MAX_BLAST_RADIUS_FILES})`,
        )
    }

    // 6. Extract Spec Allowlist
    const whitelist = extractWhitelist(prBody)
    const normalizedWhitelist = whitelist
        ? new Set(whitelist.map(normalizePath))
        : null

    // 7. Inspect each modified file entry
    for (const file of files) {
        const currentPath = normalizePath(file.filename)
        const previousPath = file.previous_filename
            ? normalizePath(file.previous_filename)
            : null

        // A. Directory Traversal Defense
        if (
            hasTraversal(currentPath) ||
            (previousPath && hasTraversal(previousPath))
        ) {
            violations.push(
                `Directory traversal attempt detected: ${file.filename}`,
            )
            continue
        }

        // B. Symlink Hijack Defense (Git mode 120000 indicates symbolic link)
        if (file.mode === '120000') {
            violations.push(`Symbolic link creation forbidden: ${currentPath}`)
            continue
        }

        // C. Protected Path Mutate Check
        if (isProtectedPath(currentPath)) {
            violations.push(
                `Mutating protected asset is forbidden: ${currentPath}`,
            )
        }

        // D. Protected Path Rename Origin Check
        if (previousPath && isProtectedPath(previousPath)) {
            violations.push(
                `Renaming or moving protected asset is forbidden: ${previousPath}`,
            )
        }

        // E. Declared Spec Allowlist Verification
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

    // 8. Post authoritative final status
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
        lineageValid: lineage.valid,
    }
}

/**
 * Inbound GitHub Webhook Handler: HMAC verification, idempotency dedupe, and async execution.
 */
export const handleGitHubWebhook = async (c: Context<{ Bindings: Env }>) => {
    const signature = c.req.header('X-Hub-Signature-256')
    const event = c.req.header('X-GitHub-Event')
    const deliveryId = c.req.header('X-GitHub-Delivery')

    // 1. Constant-Time HMAC-SHA256 Verification
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

        // 2. D1 Delivery Deduplication (if DB binding is present)
        if (deliveryId && (c.env as any).DB) {
            try {
                const res = await (c.env as any).DB.prepare(
                    `INSERT INTO webhook_deliveries (delivery_id, received_at)
                     VALUES (?1, ?2)
                     ON CONFLICT(delivery_id) DO NOTHING`,
                )
                    .bind(deliveryId, Date.now())
                    .run()

                if (res.meta && res.meta.changes === 0) {
                    return c.json(
                        { status: 'DUPLICATE_DELIVERY_IGNORED', deliveryId },
                        200,
                    )
                }
            } catch (err: any) {
                console.warn(
                    'Webhook delivery dedupe query bypassed:',
                    err.message,
                )
            }
        }

        let payload: any = {}
        try {
            payload = JSON.parse(bodyText)
        } catch {
            return c.json({ error: 'INVALID_JSON_PAYLOAD' }, 400)
        }

        if (event === 'check_run') {
            return await handleCheckRunEvent(c, payload)
        }

        // 3. Process Pull Request Events
        if (event === 'pull_request') {
            const action = payload.action
            const pr = payload.pull_request
            const repo = payload.repository

            if (
                ['opened', 'synchronize', 'reopened'].includes(action) &&
                pr &&
                repo
            ) {
                // Assert Fork Isolation
                if (!checkForkIsolation(payload)) {
                    return c.json({ error: 'FORK_DISPATCH_REJECTED' }, 403)
                }

                const owner = repo.owner?.login
                const repoName = repo.name
                const prNumber = pr.number
                const headSha = pr.head?.sha
                const baseSha = pr.base?.sha
                const prBody = pr.body

                // Offload audit to background isolate context
                c.executionCtx.waitUntil(
                    auditPullRequest(
                        owner,
                        repoName,
                        prNumber,
                        headSha,
                        baseSha,
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
