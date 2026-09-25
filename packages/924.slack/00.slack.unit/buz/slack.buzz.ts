import crypto from 'node:crypto'
import { SlackModel } from '../slack.model.js'
import slackBit from '../fce/slack.bit.js'
import State from '../../99.core/state.js'

const UPDATE_CONSOLE = '[Console action] Update Console'

const logConsole = async (src: string) => {
    if ((global as any).LIBRARY) {
        await (global as any).LIBRARY.hunt(UPDATE_CONSOLE, {
            idx: 'cns00',
            src,
        })
    }
}

const formatJson = (data: any): string => {
    return JSON.stringify(data, null, 2)
        .split('\n')
        .map((l) => `   ${l}`)
        .join('\n')
}

const getBaseUrl = (): string => {
    return (
        (global as any).slackBaseUrl ||
        process.env.LIVE_WORKER_URL ||
        process.env.WORKER_URL ||
        'https://repo-bot-00.berad4000.workers.dev'
    ).replace(/\/$/, '')
}

export function createSlackSignature(
    rawBody: string,
    timestamp: number,
    secret: string,
): string {
    const baseString = `v0:${timestamp}:${rawBody}`
    const hmac = crypto.createHmac('sha256', secret)
    hmac.update(baseString)
    return `v0=${hmac.digest('hex')}`
}

export const initSlack = (cpy: SlackModel, bal: slackBit, ste: State) => {
    if (bal.slv != null) bal.slv({ intBit: { idx: 'init-slack' } })
    return cpy
}

export const updateSlack = (cpy: SlackModel, bal: slackBit, ste: State) => {
    if (bal.slv != null) bal.slv({ intBit: { idx: 'update-slack' } })
    return cpy
}

export const probeHandshake = async (
    cpy: SlackModel,
    bal: slackBit,
    ste: State,
) => {
    const baseUrl = getBaseUrl()
    const endpoint = `${baseUrl}/api/slack/interactions`
    const challengeToken = `slack-probe-${Date.now()}`

    await logConsole('>> ==================================================')
    await logConsole(`>> [HANDSHAKE PROBE] Target: ${endpoint}`)

    const t0 = Date.now()
    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'url_verification',
                challenge: challengeToken,
            }),
        })

        const rtt = Date.now() - t0
        const text = await res.text()
        let json: any = null
        try {
            json = JSON.parse(text)
        } catch {}

        const isOk = res.ok && json?.challenge === challengeToken
        const statusTag = isOk
            ? '[OK] HANDSHAKE VERIFIED'
            : '[FAIL] CHALLENGE MISMATCH'

        await logConsole(
            `>> [HTTP ${res.status}] :: ${rtt}ms RTT ::${statusTag}`,
        )
        await logConsole(
            '>> --------------------------------------------------',
        )
        await logConsole(formatJson(json || text))
        await logConsole(
            '>> ==================================================',
        )

        if (bal.slv)
            bal.slv({
                olmBit: {
                    idx: 'probe-handshake',
                    val: isOk ? 1 : 0,
                    dat: json,
                },
            })
    } catch (err: any) {
        const rtt = Date.now() - t0
        await logConsole(`>> [CONN_ERROR] (${rtt}ms):${err.message}`)
        if (bal.slv)
            bal.slv({
                olmBit: {
                    idx: 'probe-handshake-err',
                    val: 0,
                    src: err.message,
                },
            })
    }

    return cpy
}

export const simulateInteraction = async (
    cpy: SlackModel,
    bal: slackBit,
    ste: State,
) => {
    const baseUrl = getBaseUrl()
    const endpoint = `${baseUrl}/api/slack/interactions`
    const secret = process.env.SLACK_SIGNING_SECRET || 'test-secret'

    const mode = bal.src || 'APPROVE'
    const taskId = bal.dat?.taskId || 'task-04.01'
    const headSha =
        bal.dat?.headSha || 'c7f4901b8e42f9a0d8431e21b7782a1290f12c34'
    const owner = bal.dat?.owner || 'camp-candor'
    const repo = bal.dat?.repo || '000.repo-bot'
    const pullNumber = bal.dat?.pullNumber || 42

    const authorizedUser = (
        process.env.SLACK_AUTHORIZED_APPROVERS || 'U01234567'
    )
        .split(',')[0]
        .trim()
    const userId = mode === 'UNAUTHORIZED' ? 'U_INTRUDER_999' : authorizedUser
    const actionId = mode === 'REJECT' ? 'reject_task' : 'approve_task'

    const payloadObj = {
        type: 'block_actions',
        user: {
            id: userId,
            name: mode === 'UNAUTHORIZED' ? 'intruder' : 'lead_architect',
        },
        channel: { id: 'C0C40FMRQ9H', name: 'ops-bridge' },
        message: { ts: '1727184000.000100' },
        response_url: 'https://hooks.slack.com/actions/test/response',
        actions: [
            {
                action_id: actionId,
                value: JSON.stringify({
                    taskId,
                    headSha,
                    owner,
                    repo,
                    pullNumber,
                }),
            },
        ],
    }

    const rawBody = `payload=${encodeURIComponent(JSON.stringify(payloadObj))}`
    const timestamp = Math.floor(Date.now() / 1000)
    const signature =
        mode === 'FORGED'
            ? 'v0=deadbeef00000000000000000000000000000000000000000000000000000000'
            : createSlackSignature(rawBody, timestamp, secret)

    await logConsole('>> ==================================================')
    await logConsole(
        `>> [SIMULATE ${mode}] Dispatching interaction to:${endpoint}`,
    )
    await logConsole(
        `>> Actor: <@${userId}> | Action: ${actionId} | Task:${taskId}`,
    )

    const t0 = Date.now()
    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'X-Slack-Request-Timestamp': String(timestamp),
                'X-Slack-Signature': signature,
            },
            body: rawBody,
        })

        const rtt = Date.now() - t0
        const text = await res.text()
        let json: any = null
        try {
            json = JSON.parse(text)
        } catch {}

        await logConsole(
            `>> [HTTP ${res.status}] :: ${rtt}ms RTT :: Fast-Exit (<50ms):${rtt < 50 ? 'YES [OK]' : 'NO'}`,
        )
        await logConsole(
            '>> --------------------------------------------------',
        )
        await logConsole(formatJson(json || text))
        await logConsole(
            '>> ==================================================',
        )

        if (bal.slv)
            bal.slv({
                olmBit: {
                    idx: 'simulate-interaction',
                    val: res.status,
                    dat: json,
                },
            })
    } catch (err: any) {
        const rtt = Date.now() - t0
        await logConsole(`>> [SIMULATION ERROR] (${rtt}ms):${err.message}`)
        if (bal.slv)
            bal.slv({
                olmBit: {
                    idx: 'simulate-interaction-err',
                    val: 0,
                    src: err.message,
                },
            })
    }

    return cpy
}

export const dispatchTestCard = async (
    cpy: SlackModel,
    bal: slackBit,
    ste: State,
) => {
    const token = process.env.SLACK_BOT_TOKEN
    const channel = process.env.SLACK_CHANNEL_ID || 'C0C40FMRQ9H'

    if (!token) {
        await logConsole(
            '>> [ERROR] SLACK_BOT_TOKEN is not configured in local environment.',
        )
        if (bal.slv)
            bal.slv({
                olmBit: {
                    idx: 'dispatch-card-err',
                    src: 'MISSING_SLACK_BOT_TOKEN',
                },
            })
        return cpy
    }

    await logConsole('>> ==================================================')
    await logConsole(
        `>> [LIVE DISPATCH] Sending #ops-bridge approval card to ${channel}...`,
    )

    const buttonPayload = JSON.stringify({
        taskId: 'TEST-TASK-00',
        headSha: 'abcdef1234567890',
        owner: 'camp-candor',
        repo: '000.repo-bot',
        pullNumber: 0,
    })

    const t0 = Date.now()
    try {
        const cardPayload = {
            channel,
            text: ':: Operator Test Deck: Verification Card',
            blocks: [
                {
                    type: 'header',
                    text: {
                        type: 'plain_text',
                        text: ':: Operator Test Deck Verification (TEST-TASK-00)',
                        emoji: false,
                    },
                },
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: '*Simulated Audit Clearance*\n* `characters/silas.md` (Class 1: High-Risk)\n* Invariants: `Satisfied`\n* Scope: `Allowlisted`',
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

        const res = await fetch('https://slack.com/api/chat.postMessage', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(cardPayload),
        })

        const rtt = Date.now() - t0
        const data: any = await res.json()

        if (data.ok) {
            await logConsole(
                `>> [HTTP 200 OK] :: ${rtt}ms RTT :: CARD DELIVERED TO #ops-bridge`,
            )
            await logConsole(
                `>> Message TS: ${data.ts} | Channel:${data.channel}`,
            )
        } else {
            await logConsole(`>> [SLACK API ERROR] (${rtt}ms):${data.error}`)
            if (data.error === 'not_in_channel') {
                await logConsole(
                    '>> [REMEDY] Run /invite @repo-bot inside #ops-bridge',
                )
            }
        }
        await logConsole(
            '>> ==================================================',
        )

        if (bal.slv)
            bal.slv({
                olmBit: {
                    idx: 'dispatch-test-card',
                    val: data.ok ? 1 : 0,
                    dat: data,
                },
            })
    } catch (err: any) {
        await logConsole(`>> [DISPATCH ERROR]: ${err.message}`)
        if (bal.slv)
            bal.slv({
                olmBit: { idx: 'dispatch-test-card-err', src: err.message },
            })
    }

    return cpy
}

export const dispatchJulesTestCard = async (
    cpy: SlackModel,
    bal: slackBit,
    ste: State,
) => {
    const token = process.env.SLACK_BOT_TOKEN
    const channel = process.env.SLACK_JULES_CHANNEL_ID || 'C0C4CK27LA1'
    const repo = bal.src || 'camp-candor/000.repo-bot'
    const sessionId = 'test-session-live-001'
    const prUrl = 'https://github.com/camp-candor/000.repo-bot'

    if (!token) {
        await logConsole(
            '>> [ERROR] SLACK_BOT_TOKEN is not configured in local environment.',
        )
        if (bal.slv)
            bal.slv({
                olmBit: {
                    idx: 'dispatch-jules-card-err',
                    src: 'MISSING_SLACK_BOT_TOKEN',
                },
            })
        return cpy
    }

    await logConsole('>> ==================================================')
    await logConsole(
        `>> [JULES BRIDGE DISPATCH] Sending test card to ${channel}...`,
    )

    const payload = {
        channel,
        text: `Jules Update [READY_FOR_REVIEW]: ${repo}`,
        blocks: [
            {
                type: 'header',
                text: {
                    type: 'plain_text',
                    text: ':: Jules Code Ready for Review (TEST)',
                    emoji: false,
                },
            },
            {
                type: 'section',
                fields: [
                    { type: 'mrkdwn', text: `*Repository:*\n\`${repo}\`` },
                    { type: 'mrkdwn', text: '*Status:*\n`READY_FOR_REVIEW`' },
                    {
                        type: 'mrkdwn',
                        text: '*Branch:*\n`feat/jules-observer-test`',
                    },
                    {
                        type: 'mrkdwn',
                        text: '*Channel Target:*\n`#jules-winnfield`',
                    },
                ],
            },
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: '*Task Overview:*\n> Verification payload verifying that PR and session buttons render cleanly without bleeding into #ops-bridge.',
                },
            },
            {
                type: 'actions',
                elements: [
                    {
                        type: 'button',
                        text: {
                            type: 'plain_text',
                            text: 'View Pull Request [GitHub]',
                            emoji: false,
                        },
                        url: prUrl,
                        style: 'primary',
                    },
                    {
                        type: 'button',
                        text: {
                            type: 'plain_text',
                            text: 'Open Session in Jules >>',
                            emoji: false,
                        },
                        url: `https://jules.google.com/session/${sessionId}`,
                    },
                ],
            },
        ],
    }

    const t0 = Date.now()
    try {
        const res = await fetch('https://slack.com/api/chat.postMessage', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        })

        const rtt = Date.now() - t0
        const data: any = await res.json()

        if (data.ok) {
            await logConsole(
                `>> [HTTP 200 OK] :: ${rtt}ms RTT :: CARD DELIVERED TO #jules-winnfield`,
            )
            await logConsole(
                `>> Message TS: ${data.ts} | Channel: ${data.channel}`,
            )
        } else {
            await logConsole(`>> [SLACK API ERROR] (${rtt}ms): ${data.error}`)
            if (data.error === 'not_in_channel') {
                await logConsole(
                    '>> [REMEDY] Run /invite @repo-bot inside #jules-winnfield',
                )
            }
        }
        await logConsole(
            '>> ==================================================',
        )

        if (bal.slv)
            bal.slv({
                olmBit: {
                    idx: 'dispatch-jules-test-card',
                    val: data.ok ? 1 : 0,
                    dat: data,
                },
            })
    } catch (err: any) {
        await logConsole(`>> [DISPATCH ERROR]: ${err.message}`)
        await logConsole(
            '>> ==================================================',
        )
        if (bal.slv)
            bal.slv({
                olmBit: {
                    idx: 'dispatch-jules-test-card-err',
                    src: err.message,
                },
            })
    }

    return cpy
}

export const testSlack = async (cpy: SlackModel, bal: slackBit, ste: State) => {
    await logConsole('>> ==================================================')
    await logConsole('>> STARTING SLACK GOVERNANCE GATE SMOKE BATTERY')
    await logConsole('>> ==================================================')

    await probeHandshake(cpy, { idx: 'step1' }, ste)
    await new Promise((r) => setTimeout(r, 600))

    await simulateInteraction(cpy, { idx: 'step2', src: 'FORGED' }, ste)
    await new Promise((r) => setTimeout(r, 600))

    await simulateInteraction(cpy, { idx: 'step3', src: 'UNAUTHORIZED' }, ste)
    await new Promise((r) => setTimeout(r, 600))

    await simulateInteraction(cpy, { idx: 'step4', src: 'APPROVE' }, ste)

    await logConsole('>> ==================================================')
    await logConsole('>> SLACK GATE SMOKE BATTERY COMPLETE')
    await logConsole('>> ==================================================')

    if (bal.slv != null) bal.slv({ olmBit: { idx: 'test-slack', val: 1 } })
    return cpy
}

export const listSlack = async (cpy: SlackModel, bal: slackBit, ste: State) => {
    const channels = ['#ops-bridge', '#jules-winnfield', '#general']
    if (bal.slv != null)
        bal.slv({ olmBit: { idx: 'list-slack', lst: channels } })
    return cpy
}
