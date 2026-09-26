import type { Context } from 'hono'
import { githubRequest, type Env } from './tools.js'
import {
    recordJulesSession,
    ensureJulesSchema,
    type StoredJulesSession,
} from './julesLedger.js'
import {
    buildJulesStatusCard,
    postSlackJulesMessage,
    getTargetSlackChannel,
} from './slackBridge.js'

const JULES_BASE_URL = 'https://jules.googleapis.com/v1alpha'

export interface JulesSource {
    name: string
    id?: string
    githubRepo?: {
        owner?: string
        repo?: string
    }
    githubRepoContext?: {
        owner?: string
        repo?: string
    }
    github?: {
        owner?: string
        repo?: string
    }
    repository?: string
}

/**
 * Dynamically resolves the canonical Jules source resource name for a given repository.
 */
export async function resolveJulesSource(
    owner: string,
    repo: string,
    apiKey: string,
): Promise<string> {
    const res = await fetch(`${JULES_BASE_URL}/sources`, {
        headers: {
            'x-goog-api-key': apiKey,
            'Content-Type': 'application/json',
        },
    })

    if (!res.ok) {
        const errorText = await res.text()
        throw new Error(
            `Failed to query Jules sources (${res.status}): ${errorText}`,
        )
    }

    const data: any = await res.json()
    const sources: JulesSource[] = data.sources || []

    // 1. Look for exact owner & repo match in GitHub context
    for (const s of sources) {
        const gh = s.githubRepo || s.githubRepoContext || s.github
        if (
            gh &&
            gh.owner?.toLowerCase() === owner.toLowerCase() &&
            gh.repo?.toLowerCase() === repo.toLowerCase()
        ) {
            return s.name
        }

        // Check alternate flat repository string (e.g. "camp-candor/000.repo-bot")
        if (
            s.repository &&
            s.repository.toLowerCase() === `${owner}/${repo}`.toLowerCase()
        ) {
            return s.name
        }

        // Check source id (e.g. "github/camp-candor/000.repo-bot")
        if (
            s.id &&
            s.id.toLowerCase() === `github/${owner}/${repo}`.toLowerCase()
        ) {
            return s.name
        }

        // Segment match on source name (e.g., sources/.../000.repo-bot)
        if (s.name.toLowerCase().includes(repo.toLowerCase())) {
            return s.name
        }
    }

    // 2. Format actionable error if repository is not connected
    const available = sources
        .map((s) => {
            const gh = s.githubRepo || s.githubRepoContext || s.github
            const slug = gh ? `${gh.owner}/${gh.repo}` : s.repository || s.name
            return `* \`${slug}\` (${s.name})`
        })
        .join('\n')

    throw new Error(
        `Repository '${owner}/${repo}' is not connected in Google Jules.\n` +
            `Please connect the repository at https://jules.google.com/settings/sources\n\n` +
            `*Currently Connected Sources:*\n${available || '_(None)_'}`,
    )
}

export const dispatchJulesJob = async (c: Context<{ Bindings: Env }>) => {
    const body = await c.req
        .json<{
            owner?: string
            repo?: string
            taskId?: string
            fileWhitelist?: string[]
            prompt?: string
        }>()
        .catch(() => null)

    if (!body || !body.taskId || !body.prompt) {
        return c.json({ error: 'taskId and prompt are required' }, 400)
    }

    const owner = body.owner || c.env.GITHUB_DEFAULT_OWNER || 'camp-candor'
    const repo = body.repo || '000.repo-bot'
    const taskId = body.taskId
    const fileWhitelist = body.fileWhitelist || []

    if (!c.env.JULES_API_KEY) {
        return c.json(
            {
                error: 'MISSING_JULES_API_KEY: JULES_API_KEY is not configured.',
            },
            500,
        )
    }

    try {
        // 1. Resolve canonical source resource dynamically
        const sourceResourceName = await resolveJulesSource(
            owner,
            repo,
            c.env.JULES_API_KEY,
        )

        // 2. Capture base commit SHA (S_clean)
        const mainRef: any = await githubRequest(
            `/repos/${owner}/${repo}/git/ref/heads/main`,
            c.env,
        )
        const sClean = mainRef.object.sha
        const shortSha = sClean.slice(0, 7)

        // 3. Cut ephemeral tracking branch
        const branchName = `spec/${taskId.toLowerCase()}-${shortSha}`
        await githubRequest(`/repos/${owner}/${repo}/git/refs`, c.env, {
            method: 'POST',
            body: JSON.stringify({
                ref: `refs/heads/${branchName}`,
                sha: sClean,
            }),
        })

        // 4. Compile Attention Sandwich Prompt
        const attentionSandwichPrompt = `
=== TOP ANCHOR: SYSTEM LAWS & BOUNDARIES ===
1. BOUNDED REPO MODIFICATION: Whitelist: ${JSON.stringify(fileWhitelist)}
2. FORBIDDEN: Do not modify .github/workflows/, package.json, or tests/ unless explicitly whitelisted.
3. Target Branch: ${branchName}

=== MIDDLE ANCHOR: SURGICAL DIRECTIVE ===
${body.prompt}

=== BOTTOM ANCHOR: VERIFICATION MANDATE ===
Run test suite locally before pushing. Exit code 0 required.
`.trim()

        // 5. Construct canonical v1alpha payload with resolved source
        const julesPayload = {
            prompt: attentionSandwichPrompt,
            sourceContext: {
                source: sourceResourceName,
                githubRepoContext: {
                    startingBranch: branchName,
                },
            },
            automationMode: 'AUTO_CREATE_PR',
        }

        // 5. Dispatch to canonical Google APIs endpoint
        const julesRes = await fetch(`${JULES_BASE_URL}/sessions`, {
            method: 'POST',
            headers: {
                'x-goog-api-key': c.env.JULES_API_KEY,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(julesPayload),
        })

        if (!julesRes.ok) {
            const errorText = await julesRes.text()
            console.error(`>> [JULES API ERROR ${julesRes.status}]:`, errorText)
            return c.json(
                {
                    error: `Jules dispatch failed (${julesRes.status}): ${errorText}`,
                },
                julesRes.status as any,
            )
        }

        const sessionData: any = await julesRes.json()
        const rawName = sessionData.name || ''
        const sessionId =
            sessionData.id || rawName.replace(/^sessions\//, '') || taskId

        // 6. Record to D1 Session Ledger (If DB configured)
        if (c.env.DB && sessionId) {
            c.executionCtx.waitUntil(
                recordJulesSession(c.env.DB, {
                    sessionId,
                    repo: `${owner}/${repo}`,
                    taskId,
                    branchName,
                    prompt: body.prompt,
                }).catch((err) =>
                    console.error('[D1_JULES_RECORD_ERROR]', err),
                ),
            )
        }

        return c.json({
            action: 'JULES_DISPATCHED',
            sessionId,
            branch: branchName,
            sClean,
            url:
                sessionData.url ||
                `https://jules.google.com/session/${sessionId}`,
        })
    } catch (err: any) {
        return c.json({ error: err.message }, 500)
    }
}

export const getJulesSession = async (c: Context<{ Bindings: Env }>) => {
    const id = c.req.param('id')
    if (!c.env.JULES_API_KEY) {
        return c.json({ error: 'MISSING_JULES_API_KEY' }, 500)
    }

    try {
        const res = await fetch(`${JULES_BASE_URL}/sessions/${id}`, {
            headers: {
                'x-goog-api-key': c.env.JULES_API_KEY,
            },
        })
        if (!res.ok) {
            return c.json({ error: await res.text() }, res.status as any)
        }
        return c.json(await res.json())
    } catch (err: any) {
        return c.json({ error: err.message }, 500)
    }
}

export async function pollActiveJulesSessions(env: Env): Promise<void> {
    if (!env.DB || !env.JULES_API_KEY) return
    await ensureJulesSchema(env.DB)

    const { results } = await env.DB.prepare(
        "SELECT * FROM jules_sessions WHERE status NOT IN ('COMPLETED', 'FAILED') LIMIT 25",
    ).all()

    const activeSessions = (results || []) as StoredJulesSession[]
    if (activeSessions.length === 0) return

    for (const item of activeSessions) {
        try {
            const res = await fetch(
                `${JULES_BASE_URL}/sessions/${item.session_id}`,
                {
                    headers: {
                        'x-goog-api-key': env.JULES_API_KEY,
                    },
                },
            )
            if (!res.ok) continue

            const data: any = await res.json()
            const currentState = data.state || data.status || 'RUNNING'
            const latestPrompt =
                data.lastPrompt || data.lastMessage || data.prompt || ''

            const needsUserInput =
                currentState === 'AWAITING_USER_INPUT' ||
                currentState === 'NEEDS_ATTENTION' ||
                currentState === 'PAUSED'

            if (needsUserInput && item.last_status !== currentState) {
                const askJulesChannel = getTargetSlackChannel('ASK_JULES', env)

                const card = buildJulesStatusCard(
                    {
                        sessionId: item.session_id,
                        repo: item.repo,
                        taskId: item.task_id,
                        status: 'INPUT_REQUIRED',
                        branchName: item.branch_name,
                        targetChannel: askJulesChannel,
                        queryText:
                            latestPrompt ||
                            'Jules is waiting for your input to continue.',
                    },
                    env,
                )

                await postSlackJulesMessage(card, env)

                await env.DB.prepare(
                    'UPDATE jules_sessions SET status = ?, last_status = ?, updated_at = ? WHERE session_id = ?',
                )
                    .bind(
                        currentState,
                        currentState,
                        Date.now(),
                        item.session_id,
                    )
                    .run()
            } else if (
                currentState === 'COMPLETED' ||
                currentState === 'FAILED'
            ) {
                await env.DB.prepare(
                    'UPDATE jules_sessions SET status = ?, updated_at = ? WHERE session_id = ?',
                )
                    .bind(currentState, Date.now(), item.session_id)
                    .run()
            }
        } catch (err: any) {
            console.error(
                `[JULES_POLLER_ERROR] Session ${item.session_id}:`,
                err.message,
            )
        }
    }
}
