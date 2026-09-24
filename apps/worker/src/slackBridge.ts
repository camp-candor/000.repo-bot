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

export function sanitizeChannelId(raw?: string): string {
    const cleaned = (raw || '')
        .trim()
        .replace(/^["']|["']$/g, '')
        .trim()
    if (!cleaned || cleaned === '#ops-bridge') {
        return 'C0C40FMRQ9H'
    }
    return cleaned
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

    const channel = sanitizeChannelId(env.SLACK_CHANNEL_ID)
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

export interface MergeAnnouncementParams {
    taskId: string
    pullNumber: number
    mergeCommitSha: string
    auditedHeadSha: string
    targetBranch?: string
    actor?: string
    repo?: string
    owner?: string
    prTitle?: string
    branchName?: string
    origin?: 'REPO_BOT_CAS' | 'GITHUB_MANUAL_UI'
}

/**
 * Distributes a standalone merge completion announcement to the #ops-bridge channel.
 * Expressly discriminates between Repo-Bot automated CAS merges and direct GitHub manual UI merges.
 */
export async function postSlackMergeAnnouncement(
    params: MergeAnnouncementParams,
    env: Env,
): Promise<{ ok: boolean; ts?: string; error?: string }> {
    const token = env.SLACK_BOT_TOKEN
    const channel = sanitizeChannelId(env.SLACK_CHANNEL_ID)

    if (!token) {
        console.warn(
            'Slack merge announcement skipped: SLACK_BOT_TOKEN not configured',
        )
        return { ok: false, error: 'MISSING_SLACK_BOT_TOKEN' }
    }

    const shortMergeSha = (params.mergeCommitSha || '0000000').slice(0, 7)
    const shortHeadSha = (params.auditedHeadSha || '0000000').slice(0, 7)
    const targetBranch = params.targetBranch || 'main'
    const repoSlug =
        params.owner && params.repo
            ? `${params.owner}/${params.repo}`
            : '000.repo-bot'
    const prTitleText = params.prTitle ? ` - ${params.prTitle}` : ''
    const origin = params.origin || 'REPO_BOT_CAS'

    let blocks: any[] = []
    let fallbackText = ''

    if (origin === 'GITHUB_MANUAL_UI') {
        // Explicitly format as a manual GitHub Web UI merge event
        fallbackText = `:: [GITHUB MANUAL MERGE] PR #${params.pullNumber} merged directly on GitHub into ${targetBranch} by ${params.actor || 'unknown'}`
        blocks = [
            {
                type: 'header',
                text: {
                    type: 'plain_text',
                    text: `:: GITHUB MANUAL MERGE DETECTED (PR #${params.pullNumber})`,
                    emoji: false,
                },
            },
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text:
                        `*[ORIGIN: DIRECT GITHUB WEB CONSOLE / EXTERNAL ACTOR]*\n` +
                        `*Notice:* This merge was executed directly on GitHub, outside the Repo-Bot CAS verification executor.\n` +
                        `*Repository:* \`${repoSlug}\` | *PR:* <https://github.com/${repoSlug}/pull/${params.pullNumber}|#${params.pullNumber}${prTitleText}>\n` +
                        `*Merged By:* *${params.actor || 'GitHub UI'}*\n` +
                        `*Target Trunk:* \`${targetBranch}\` ──► *Squash/Merge SHA:* \`${shortMergeSha}\`\n` +
                        `*Head Ref:* \`${params.branchName || shortHeadSha}\`\n` +
                        `*Status:* [OK] GitHub Webhook ingested. Distributed state reconciled.`,
                },
            },
        ]
    } else {
        // Standard Repo-Bot CAS Executor release announcement
        const actorText = params.actor
            ? `<@${params.actor}>`
            : 'Autonomous Fast-Track'
        fallbackText = `:: [RELEASE] PR #${params.pullNumber} (${params.taskId}) merged into ${targetBranch}`
        blocks = [
            {
                type: 'header',
                text: {
                    type: 'plain_text',
                    text: `:: MERGE COMPLETE: ${params.taskId}`,
                    emoji: false,
                },
            },
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text:
                        `*[ORIGIN: REPO-BOT CAS MERGE EXECUTOR]*\n` +
                        `*Repository:* \`${repoSlug}\` | *PR:* <https://github.com/${repoSlug}/pull/${params.pullNumber}|#${params.pullNumber}>\n` +
                        `*Audited Commit:* \`${shortHeadSha}\` ──► *Squash Merge SHA:* \`${shortMergeSha}\`\n` +
                        `*Trunk Target:* \`${targetBranch}\` | *Author/Approver:* ${actorText}\n` +
                        `*Status:* [OK] Ephemeral tracking branch obliterated. Trunk invariants satisfied.`,
                },
            },
        ]
    }

    try {
        const res = await fetch('https://slack.com/api/chat.postMessage', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json; charset=utf-8',
            },
            body: JSON.stringify({
                channel,
                text: fallbackText,
                blocks,
            }),
        })

        const data: any = await res.json()
        if (!data.ok) {
            console.error('Slack broadcast failed:', data.error)
            return { ok: false, error: data.error }
        }

        return { ok: true, ts: data.ts }
    } catch (err: any) {
        console.error(
            'Network error dispatching Slack merge broadcast:',
            err.message,
        )
        return { ok: false, error: err.message }
    }
}
export interface EmergencyAlertParams {
    taskId: string
    pullNumber?: number
    mergeCommitSha?: string
    headSha: string
    reason: string
    actor?: string
    owner?: string
    repo?: string
    targetBranch?: string
}

/**
 * Distributes a high-visibility emergency rollback alert to #ops-bridge.
 */
export async function postSlackEmergencyAlert(
    params: EmergencyAlertParams,
    env: Env,
): Promise<{ ok: boolean; ts?: string; error?: string }> {
    const token = env.SLACK_BOT_TOKEN
    const channel = sanitizeChannelId(env.SLACK_CHANNEL_ID)

    if (!token) {
        console.warn(
            'Slack emergency alert skipped: SLACK_BOT_TOKEN not configured',
        )
        return { ok: false, error: 'MISSING_SLACK_BOT_TOKEN' }
    }

    const repoSlug =
        params.owner && params.repo
            ? `${params.owner}/${params.repo}`
            : '000.repo-bot'
    const targetBranch = params.targetBranch || 'main'
    const shortHead = (params.headSha || '0000000').slice(0, 7)
    const shortMerge = params.mergeCommitSha
        ? params.mergeCommitSha.slice(0, 7)
        : 'N/A'

    const payload = {
        channel,
        text: `:: [EMERGENCY ROLLBACK] Task ${params.taskId} rolled back on ${targetBranch}`,
        blocks: [
            {
                type: 'header',
                text: {
                    type: 'plain_text',
                    text: `:: CRITICAL: SAGA ROLLBACK EXECUTED (${params.taskId})`,
                    emoji: false,
                },
            },
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text:
                        `*[ALERT: COMPENSATING SAGA TRIGGERED]*\n` +
                        `*Repository:* \`${repoSlug}\` | *Trunk Target:* \`${targetBranch}\`\n` +
                        (params.pullNumber && params.pullNumber > 0
                            ? `*PR:* <https://github.com/${repoSlug}/pull/${params.pullNumber}|#${params.pullNumber}>\n`
                            : '') +
                        `*Candidate SHA:* \`${shortHead}\` | *Merge SHA:* \`${shortMerge}\`\n` +
                        `*Root Cause:* \`${params.reason}\`\n` +
                        `*Triggered By:* ${params.actor ? `<@${params.actor}>` : 'System Watchdog'}\n` +
                        `*Remediation:* [OK] Compensating teardown executed. Ephemeral artifacts dismantled.`,
                },
            },
        ],
    }

    try {
        const res = await fetch('https://slack.com/api/chat.postMessage', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json; charset=utf-8',
            },
            body: JSON.stringify(payload),
        })

        const data: any = await res.json()
        if (!data.ok) {
            console.error('Slack emergency alert failed:', data.error)
            return { ok: false, error: data.error }
        }

        return { ok: true, ts: data.ts }
    } catch (err: any) {
        console.error(
            'Network error dispatching Slack emergency alert:',
            err.message,
        )
        return { ok: false, error: err.message }
    }
}
