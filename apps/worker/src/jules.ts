import type { Context } from 'hono'
import { githubRequest, type Env } from './tools.js'

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
        // 1. Capture base commit SHA (S_clean)
        const mainRef: any = await githubRequest(
            `/repos/${owner}/${repo}/git/ref/heads/main`,
            c.env,
        )
        const sClean = mainRef.object.sha
        const shortSha = sClean.slice(0, 7)

        // 2. Cut ephemeral branch
        const branchName = `spec/${taskId.toLowerCase()}-${shortSha}`
        await githubRequest(`/repos/${owner}/${repo}/git/refs`, c.env, {
            method: 'POST',
            body: JSON.stringify({
                ref: `refs/heads/${branchName}`,
                sha: sClean,
            }),
        })

        // 3. Compile Attention Sandwich Prompt
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

        // 4. Dispatch to Jules REST API
        const julesRes = await fetch('https://jules.google/api/v1/sessions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${c.env.JULES_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                repository: `${owner}/${repo}`,
                starting_branch: branchName,
                task_description: attentionSandwichPrompt,
            }),
        })

        if (!julesRes.ok) {
            const errorText = await julesRes.text()
            return c.json(
                { error: `Jules dispatch failed: ${errorText}` },
                julesRes.status as any,
            )
        }

        const sessionData: any = await julesRes.json()
        return c.json({
            action: 'JULES_DISPATCHED',
            sessionId: sessionData.sessionId || sessionData.id,
            branch: branchName,
            sClean,
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
        const res = await fetch(`https://jules.google/api/v1/sessions/${id}`, {
            headers: { Authorization: `Bearer ${c.env.JULES_API_KEY}` },
        })
        if (!res.ok) {
            return c.json({ error: await res.text() }, res.status as any)
        }
        return c.json(await res.json())
    } catch (err: any) {
        return c.json({ error: err.message }, 500)
    }
}
