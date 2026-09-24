import type { Context } from 'hono'
import { verifySlackSignature, updateSlackMessage } from '../slackBridge.js'
import { githubRequest, type Env } from '../tools.js'

export interface SlackInteractionPayload {
    type: string
    user: { id: string; name: string }
    channel: { id: string; name: string }
    message?: { ts: string }
    response_url: string
    actions: Array<{
        action_id: string
        value: string
    }>
}

/**
 * Handles incoming Slack interactive component webhooks (button clicks).
 */
export async function handleSlackInteraction(c: Context<{ Bindings: Env }>) {
    const rawBody = await c.req.text()
    const timestamp = c.req.header('X-Slack-Request-Timestamp')
    const signature = c.req.header('X-Slack-Signature')

    // 1. Verify HMAC-SHA256 Signature
    if (!c.env.SLACK_SIGNING_SECRET) {
        return c.json({ error: 'SLACK_SIGNING_SECRET_NOT_CONFIGURED' }, 500)
    }

    const verification = await verifySlackSignature(
        rawBody,
        { timestamp, signature },
        c.env.SLACK_SIGNING_SECRET,
    )

    if (!verification.valid) {
        return c.json(
            {
                error: 'UNAUTHORIZED_SLACK_SIGNATURE',
                reason: verification.reason,
            },
            401,
        )
    }

    // 2. Parse application/x-www-form-urlencoded body
    const params = new URLSearchParams(rawBody)
    const payloadStr = params.get('payload')

    if (!payloadStr) {
        return c.text('Missing payload parameter in form data', 400)
    }

    let payload: SlackInteractionPayload
    try {
        payload = JSON.parse(payloadStr)
    } catch {
        return c.text('Malformed payload JSON', 400)
    }

    const action = payload.actions?.[0]
    if (!action) {
        return c.text('No action present in payload', 400)
    }

    let actionData: {
        taskId: string
        headSha: string
        owner: string
        repo: string
        pullNumber: number
    }
    try {
        actionData = JSON.parse(action.value)
    } catch {
        return c.text('Invalid action value JSON', 400)
    }

    const userId = payload.user?.id
    const isApprove = action.action_id === 'approve_task'
    const isReject = action.action_id === 'reject_task'

    if (!isApprove && !isReject) {
        return c.text('Unrecognized action ID', 400)
    }

    // 3. Approver RBAC Check
    const authorizedApprovers = (c.env.SLACK_AUTHORIZED_APPROVERS || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)

    if (
        authorizedApprovers.length > 0 &&
        (!userId || !authorizedApprovers.includes(userId))
    ) {
        return c.json({
            response_type: 'ephemeral',
            text: `[FAIL] Unauthorized: User <@${userId}> is not in the Lead Architect approval allowlist.`,
        })
    }

    // 4. Sub-3-Second Fast Exit: Offload execution to waitUntil
    c.executionCtx.waitUntil(
        executeHumanDecision(c.env, payload, actionData, isApprove),
    )

    // Immediate acknowledgement to satisfy Slack timeout SLA
    return c.json({
        response_type: 'ephemeral',
        text: `>> [PROCESSING] Request received from <@${userId}>. Executing ${isApprove ? 'APPROVAL' : 'REJECTION'}...`,
    })
}

/**
 * Asynchronous execution of human approval/rejection decision.
 */
async function executeHumanDecision(
    env: Env,
    payload: SlackInteractionPayload,
    actionData: {
        taskId: string
        headSha: string
        owner: string
        repo: string
        pullNumber: number
    },
    isApprove: boolean,
) {
    const { taskId, headSha, owner, repo, pullNumber } = actionData
    const userId = payload.user?.id

    // A. Atomic Idempotency Check via D1
    if (env.DB) {
        try {
            await env.DB.prepare(
                `CREATE TABLE IF NOT EXISTS task_approvals (
                    task_id TEXT NOT NULL,
                    head_sha TEXT NOT NULL,
                    approver_id TEXT NOT NULL,
                    decision TEXT NOT NULL,
                    approved_at INTEGER NOT NULL,
                    PRIMARY KEY (task_id, head_sha)
                )`,
            ).run()

            const insertRes = await env.DB.prepare(
                `INSERT INTO task_approvals (task_id, head_sha, approver_id, decision, approved_at)
                 VALUES (?1, ?2, ?3, ?4, ?5)
                 ON CONFLICT(task_id, head_sha) DO NOTHING`,
            )
                .bind(
                    taskId,
                    headSha,
                    userId,
                    isApprove ? 'APPROVED' : 'REJECTED',
                    Date.now(),
                )
                .run()

            if (insertRes.meta && insertRes.meta.changes === 0) {
                console.warn(
                    `Idempotency guard: ${taskId}@${headSha} was already decided.`,
                )
                return
            }
        } catch (err: any) {
            console.warn(
                'D1 task_approvals ledger check bypassed:',
                err.message,
            )
        }
    }

    // B. Dual-Authority: Submit Authenticated GitHub PR Review
    try {
        await githubRequest(
            `/repos/${owner}/${repo}/pulls/${pullNumber}/reviews`,
            env,
            {
                method: 'POST',
                body: JSON.stringify({
                    commit_id: headSha,
                    event: isApprove ? 'APPROVE' : 'REQUEST_CHANGES',
                    body: isApprove
                        ? `[OK] Ratified by Lead Architect <@${userId}> via Repo-Bot Slack Bridge.`
                        : `[FAIL] Rejected by Lead Architect <@${userId}> via Repo-Bot Slack Bridge. Rollback initiated.`,
                }),
            },
        )
    } catch (err: any) {
        console.error('Failed to submit GitHub PR review:', err.message)
    }

    // C. Forward Decision to Durable Object FSM
    if (env.REPO_BOT_DO) {
        try {
            const doId = env.REPO_BOT_DO.idFromName(taskId)
            const taskDO = env.REPO_BOT_DO.get(doId)

            const fsmRes = await taskDO.fetch(
                new Request('https://internal/fsm/transition', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        type: isApprove ? 'HUMAN_APPROVED' : 'HUMAN_REJECTED',
                        actor: 'LEAD_ARCHITECT',
                        taskId,
                        headSha,
                        approverId: userId,
                        timestamp: Date.now(),
                    }),
                }),
            )

            if (!fsmRes.ok) {
                console.error(
                    'DO state transition failed:',
                    await fsmRes.text(),
                )
            }
        } catch (err: any) {
            console.error('Failed to contact RepoBotDO:', err.message)
        }
    }

    // D. Update Original Slack Message
    if (payload.channel?.id && payload.message?.ts) {
        const updateText = isApprove
            ? `*:: PR APPROVED & RATIFIED*\nTask: \`${taskId}\` | SHA: \`${headSha.slice(0, 7)}\`\nApprover: <@${userId}> | Status: Advancing to MERGING`
            : `*:: PR REJECTED*\nTask: \`${taskId}\` | SHA: \`${headSha.slice(0, 7)}\`\nDecider: <@${userId}> | Status: Rolling back ephemeral branch`

        await updateSlackMessage(
            payload.channel.id,
            payload.message.ts,
            updateText,
            env,
        )
    }
}
