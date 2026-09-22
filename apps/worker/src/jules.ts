import { githubRequest, type Env } from './tools.js'

export interface DispatchJulesParams {
    owner: string
    repo: string
    taskId: string
    fileWhitelist: string[]
    prompt: string
}

export async function dispatchJulesJob(params: DispatchJulesParams, env: Env) {
    if (!env.JULES_API_KEY) {
        throw new Error(
            'MISSING_JULES_API_KEY: Ensure JULES_API_KEY is configured in Worker secrets or .dev.vars.',
        )
    }

    // 1. Capture S_clean: Freeze base commit SHA from trunk
    const mainRef: any = await githubRequest(
        `/repos/${params.owner}/${params.repo}/git/ref/heads/main`,
        env,
    )
    const sClean = mainRef.object.sha
    const shortSha = sClean.slice(0, 7)

    // 2. Provision isolated ephemeral branch
    const branchName = `spec/${params.taskId.toLowerCase()}-${shortSha}`
    await githubRequest(`/repos/${params.owner}/${params.repo}/git/refs`, env, {
        method: 'POST',
        body: JSON.stringify({
            ref: `refs/heads/${branchName}`,
            sha: sClean,
        }),
    })

    // 3. Attention Sandwich Task Prompt Compilation
    const taskPrompt = `
=== TOP ANCHOR: SYSTEM LAWS & NEGATIVE BOUNDARIES ===
1. BOUNDED REPO MODIFICATION: You are strictly restricted to: ${JSON.stringify(params.fileWhitelist)}
2. FORBIDDEN: Do not modify .github/workflows/, package.json, or tests/ unless explicitly whitelisted.
3. FORBIDDEN: Do not introduce Nx, Lerna, Yarn, or PNPM.
4. Target Branch: ${branchName}

=== MIDDLE ANCHOR: SURGICAL DIRECTIVE ===
${params.prompt}

=== BOTTOM ANCHOR: VERIFICATION MANDATE ===
Execute 'npm test' or the workspace test runner inside your VM.
Exit code 0 is mandatory before pushing commits.
`.trim()

    // 4. Dispatch task to Jules REST API
    const julesRes = await fetch('https://jules.google/api/v1/sessions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${env.JULES_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            repository: `${params.owner}/${params.repo}`,
            starting_branch: branchName,
            task_description: taskPrompt,
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
                Authorization: `Bearer ${env.JULES_API_KEY}`,
            },
        },
    )

    if (!res.ok) {
        throw new Error(
            `Jules API getSession failed (${res.status}): ${await res.text()}`,
        )
    }

    return await res.json()
}
