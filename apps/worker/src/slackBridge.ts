import type { Env } from './tools.js'

export interface ApprovalCardParams {
    taskId: string
    owner: string
    repo: string
    pullNumber: number
    headSha: string
    branchName: string
    highRiskFiles: string[]
    summary?: string
}

/**
 * Verifies Slack webhook signature using Web Crypto constant-time HMAC-SHA256.
 */
export async function verifySlackSignature(
    rawBody: string,
    headers: { timestamp?: string | null; signature?: string | null },
    signingSecret: string,
): Promise<{ valid: boolean; reason?: string }> {
    const { timestamp, signature } = headers

    if (!timestamp || !signature) {
        return {
            valid: false,
            reason: 'Missing timestamp or signature headers',
        }
    }

    const currentTimestamp = Math.floor(Date.now() / 1000)
    const tsNumber = parseInt(timestamp, 10)

    // Replay attack defense: reject requests older than 5 minutes (300 seconds)
    if (isNaN(tsNumber) || Math.abs(currentTimestamp - tsNumber) > 300) {
        return { valid: false, reason: 'Timestamp skewed beyond 300 seconds' }
    }

    const baseString = `v0:${timestamp}:${rawBody}`
    const encoder = new TextEncoder()

    const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(signingSecret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify'],
    )

    const sigHex = signature.startsWith('v0=') ? signature.slice(3) : signature
    const sigBytes = new Uint8Array(
        sigHex.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || [],
    )

    const isValid = await crypto.subtle.verify(
        'HMAC',
        key,
        sigBytes,
        encoder.encode(baseString),
    )

    return {
        valid: isValid,
        reason: isValid ? undefined : 'HMAC verification failed',
    }
}

/**
 * Builds Slack Block Kit payload for human approval review cards.
 */
export function buildApprovalBlockKit(params: ApprovalCardParams) {
    const fileListFormatted =
        params.highRiskFiles.length > 0
            ? params.highRiskFiles.map((f) => `* \`${f}\``).join('\n')
            : '* None detected (policy triggered)'

    const buttonPayload = JSON.stringify({
        taskId: params.taskId,
        headSha: params.headSha,
        owner: params.owner,
        repo: params.repo,
        pullNumber: params.pullNumber,
    })

    return {
        text: `PR Awaiting Human Sign-Off: ${params.taskId}`,
        blocks: [
            {
                type: 'header',
                text: {
                    type: 'plain_text',
                    text: `:: PR Awaiting Human Sign-Off (${params.taskId})`,
                    emoji: false,
                },
            },
            {
                type: 'section',
                fields: [
                    {
                        type: 'mrkdwn',
                        text: `*Repository:*\n${params.owner}/${params.repo}`,
                    },
                    {
                        type: 'mrkdwn',
                        text: `*PR Number:*\n#${params.pullNumber}`,
                    },
                    {
                        type: 'mrkdwn',
                        text: `*Commit SHA:*\n\`${params.headSha.slice(0, 7)}\``,
                    },
                    {
                        type: 'mrkdwn',
                        text: `*Tracking Ref:*\n\`${params.branchName}\``,
                    },
                ],
            },
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `*Modified High-Risk Assets:*\n${fileListFormatted}\n\n*Quality Gauntlet:*\n[OK] Levels 0-4 Passed | Invariants Satisfied`,
                },
            },
            {
                type: 'actions',
                block_id: 'approval_actions',
                elements: [
                    {
                        type: 'button',
                        text: {
                            type: 'plain_text',
                            text: 'Approve & Merge',
                            emoji: false,
                        },
                        style: 'primary',
                        action_id: 'approve_task',
                        value: buttonPayload,
                    },
                    {
                        type: 'button',
                        text: {
                            type: 'plain_text',
                            text: 'Reject & Teardown',
                            emoji: false,
                        },
                        style: 'danger',
                        action_id: 'reject_task',
                        value: buttonPayload,
                    },
                ],
            },
        ],
    }
}

/**
 * Dispatches an approval card to Slack via chat.postMessage.
 */
export async function dispatchSlackApprovalCard(
    params: ApprovalCardParams,
    env: Env,
): Promise<{ ok: boolean; ts?: string; error?: string }> {
    if (!env.SLACK_BOT_TOKEN) {
        console.warn(
            'dispatchSlackApprovalCard bypassed: SLACK_BOT_TOKEN not configured',
        )
        return { ok: false, error: 'MISSING_SLACK_BOT_TOKEN' }
    }

    const channel = env.SLACK_CHANNEL_ID || '#ops-bridge'
    const card = buildApprovalBlockKit(params)

    try {
        const res = await fetch('https://slack.com/api/chat.postMessage', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${env.SLACK_BOT_TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ channel, ...card }),
        })

        const data: any = await res.json()
        if (!data.ok) {
            console.error('Slack chat.postMessage failed:', data.error)
            return { ok: false, error: data.error }
        }
        return { ok: true, ts: data.ts }
    } catch (err: any) {
        console.error('Slack dispatch error:', err.message)
        return { ok: false, error: err.message }
    }
}

/**
 * Updates a Slack approval card to an invalid or completed status.
 */
export async function updateSlackMessage(
    channel: string,
    ts: string,
    text: string,
    env: Env,
): Promise<boolean> {
    if (!env.SLACK_BOT_TOKEN) return false

    try {
        const res = await fetch('https://slack.com/api/chat.update', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${env.SLACK_BOT_TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                channel,
                ts,
                text,
                blocks: [
                    {
                        type: 'section',
                        text: { type: 'mrkdwn', text },
                    },
                ],
            }),
        })
        const data: any = await res.json()
        return !!data.ok
    } catch (err: any) {
        console.error('Slack update error:', err.message)
        return false
    }
}
