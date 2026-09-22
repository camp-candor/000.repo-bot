import { type Context } from 'hono'
import { githubRequest, type Env } from './tools.js'

export interface DispatchJulesParams {
    owner: string
    repo: string
    taskId: string
    fileWhitelist?: string[]
    prompt: string
    baseBranch?: string
}

export async function dispatchJulesJob(params: DispatchJulesParams, env: Env) {
    if (!env.JULES_API_KEY) {
        throw new Error(
            'MISSING_JULES_API_KEY: Ensure JULES_API_KEY is configured in Worker secrets or .dev.vars.',
        )
    }

    const owner = params.owner || 'camp-candor'
    const repo = params.repo || '000.repo-bot'
    const baseBranch = params.baseBranch || 'main'
    const taskId = (params.taskId || 'TASK-01').toUpperCase()
    const fileWhitelist = params.fileWhitelist || []

    // 1. Capture S_clean: Freeze base commit SHA from trunk BEFORE contacting Jules API
    const refData: any = await githubRequest(
        `/repos/${owner}/${repo}/git/ref/heads/${baseBranch}`,
        env,
    )
    const sClean: string = refData.object.sha
    const shortSha = sClean.slice(0, 7)

    // 2. Provision isolated ephemeral branch BEFORE contacting Jules API
    const branchName = `spec/${taskId}-${shortSha}`
    await githubRequest(`/repos/${owner}/${repo}/git/refs`, env, {
        method: 'POST',
        body: JSON.stringify({
            ref: `refs/heads/${branchName}`,
            sha: sClean,
        }),
    })

    // 3. Assemble Attention Sandwich Task Prompt Compilation
    const topAnchor = [
        '=== TOP ANCHOR: SYSTEM LAWS & BOUNDARIES ===',
        `1. WORKSPACE ISOLATION: Target branch is ${branchName} (forked from ${sClean}).`,
        `2. IMMUTABLE RUNNER: You are strictly forbidden from modifying apps/995.library/.`,
        fileWhitelist.length > 0
            ? `3. FILE WHITELIST: You may only modify: ${JSON.stringify(fileWhitelist)}.`
            : '3. SCOPE INTEGRITY: Do not modify protected files (.github/workflows/, package.json, tests/).',
        '4. ZERO VIBE TOLERANCE: Do not introduce Nx, Lerna, Yarn, or PNPM.',
    ].join('\n')

    const middleAnchor = [
        '=== MIDDLE ANCHOR: SURGICAL TASK DIRECTIVE ===',
        params.prompt,
    ].join('\n')

    const bottomAnchor = [
        '=== BOTTOM ANCHOR: TEST VERIFICATION MANDATE ===',
        'Execute verification suites (e.g. npm test) inside your sandbox.',
        'Exit code 0 is mandatory before pushing any commits.',
    ].join('\n')

    const attentionSandwich = `${topAnchor}\n\n${middleAnchor}\n\n${bottomAnchor}`

    // 4. Dispatch task to Jules REST API
    const julesRes = await fetch('https://jules.google/api/v1/sessions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${env.JULES_API_KEY}`,
            'Content-Type': 'application/json',
            'User-Agent': 'repo-bot-edge',
        },
        body: JSON.stringify({
            repository: `github.com/${owner}/${repo}`,
            starting_branch: branchName,
            task_description: attentionSandwich,
        }),
    })

    if (!julesRes.ok) {
        const errorText = await julesRes.text()
        throw new Error(
            `Jules API dispatch failed (${julesRes.status}): ${errorText}`,
        )
    }

    const sessionData: any = await julesRes.json()
    return {
        action: 'JULES_DISPATCHED',
        sessionId: sessionData.sessionId || sessionData.id,
        branch: branchName,
        sClean,
        session: sessionData,
    }
}

export async function getJulesSession(sessionId: string, env: Env) {
    if (!env.JULES_API_KEY) {
        throw new Error(
            'MISSING_JULES_API_KEY: Ensure JULES_API_KEY is configured in Worker secrets or .dev.vars.',
        )
    }

    const res = await fetch(
        `https://jules.google/api/v1/sessions/${sessionId}`,
        {
            headers: {
                'Authorization': `Bearer ${env.JULES_API_KEY}`,
                'User-Agent': 'repo-bot-edge',
            },
        },
    )

    if (!res.ok) {
        const errorText = await res.text()
        throw new Error(
            `Jules API getSession failed (${res.status}): ${errorText}`,
        )
    }

    return await res.json()
}

// Hono route handlers
export async function handleDispatchJules(c: Context<{ Bindings: Env }>) {
    try {
        const body = await c.req.json<any>()
        const result = await dispatchJulesJob(
            {
                owner: body.owner || 'camp-candor',
                repo: body.repo || '000.repo-bot',
                taskId: body.taskId || 'TASK-01',
                fileWhitelist: body.fileWhitelist,
                prompt: body.prompt || body.task || '',
                baseBranch: body.baseBranch || 'main',
            },
            c.env,
        )
        return c.json(result)
    } catch (error: any) {
        return c.json({ error: error.message }, 500)
    }
}

export async function handleGetJulesSession(c: Context<{ Bindings: Env }>) {
    try {
        const sessionId = c.req.param('id')
        if (!sessionId) {
            return c.json({ error: 'Session ID is required' }, 400)
        }
        const data = await getJulesSession(sessionId, c.env)
        return c.json(data)
    } catch (error: any) {
        return c.json({ error: error.message }, 500)
    }
}
