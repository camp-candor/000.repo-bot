import { SlackModel } from '../slack.model.js'
import slackBit from '../fce/slack.bit.js'
import State from '../../99.core/state.js'

const slack = {
    list: async () => ({ channels: ['#ops-bridge', '#general', '#devops'] }),
}

export const initSlack = (cpy: SlackModel, bal: slackBit, ste: State) => {
    if (bal.slv != null) bal.slv({ intBit: { idx: 'init-slack' } })
    return cpy
}

export const updateSlack = (cpy: SlackModel, bal: slackBit, ste: State) => {
    if (bal.slv != null) bal.slv({ intBit: { idx: 'update-slack' } })
    return cpy
}

export const testSlack = async (cpy: SlackModel, bal: slackBit, ste: State) => {
    const baseUrl = (
        (global as any).slackBaseUrl ||
        process.env.LIVE_WORKER_URL ||
        process.env.WORKER_URL ||
        'http://127.0.0.1:8787'
    ).replace(/\/$/, '')

    const endpoint = `${baseUrl}/api/slack/interactions`

    try {
        // @ts-ignore
        if (global.LIBRARY) {
            // @ts-ignore
            await global.LIBRARY.hunt('[Console action] Update Console', {
                idx: 'cns00',
                src: `>> [SLACK PROBE] Dispatching URL verification challenge to ${endpoint}...`,
            })
        }

        const challengeToken = `slack-challenge-${Date.now()}`
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                type: 'url_verification',
                challenge: challengeToken,
            }),
        })

        if (!res.ok) {
            const errText = await res.text()
            throw new Error(`Worker HTTP ${res.status}: ${errText}`)
        }

        const data: any = await res.json()

        // @ts-ignore
        if (global.LIBRARY) {
            const formatted = JSON.stringify(data, null, 2)
                .split('\n')
                .map((line: string) => `   ${line}`)
                .join('\n')

            // @ts-ignore
            await global.LIBRARY.hunt('[Console action] Update Console', {
                idx: 'cns00',
                src: '>> ==================================================',
            })
            // @ts-ignore
            await global.LIBRARY.hunt('[Console action] Update Console', {
                idx: 'cns00',
                src: `>> [SLACK HANDSHAKE RECEIPT] Challenge: ${data?.challenge === challengeToken ? 'VERIFIED [OK]' : 'MISMATCH [FAIL]'}`,
            })
            // @ts-ignore
            await global.LIBRARY.hunt('[Console action] Update Console', {
                idx: 'cns00',
                src: formatted,
            })
            // @ts-ignore
            await global.LIBRARY.hunt('[Console action] Update Console', {
                idx: 'cns00',
                src: '>> ==================================================',
            })
        }

        if (bal.slv != null) {
            bal.slv({
                mytBit: {
                    idx: 'test-slack',
                    val: 1,
                    dat: data,
                },
            })
        }
    } catch (err: any) {
        // @ts-ignore
        if (global.LIBRARY) {
            // @ts-ignore
            await global.LIBRARY.hunt('[Console action] Update Console', {
                idx: 'cns00',
                src: `>> [SLACK TEST ERROR] ${err.message}`,
            })
        }

        if (bal.slv != null) {
            bal.slv({
                mytBit: {
                    idx: 'test-slack-err',
                    val: 0,
                    dat: { error: err.message },
                },
            })
        }
    }

    return cpy
}

export const listSlack = async (cpy: SlackModel, bal: slackBit, ste: State) => {
    const response = await slack.list()
    if (bal.slv != null)
        bal.slv({
            olmBit: {
                idx: 'list-slack',
                lst: response.channels,
            },
        })
    return cpy
}

export const connectSlack = (cpy: SlackModel, bal: slackBit, ste: State) => {
    const isLocal = bal.src === 'LOCAL'
    const wsUrl = isLocal
        ? 'ws://localhost:8787/ws'
        : 'wss://worker-agent.berad4000.workers.dev/ws'
    const prefix = isLocal ? '[LOCAL WORKER]' : '[REMOTE WORKER]'

    // @ts-ignore
    global.slackBaseUrl = isLocal
        ? 'http://localhost:8787'
        : 'https://worker-agent.berad4000.workers.dev'

    // @ts-ignore
    const ws = new WebSocket(wsUrl)

    // @ts-ignore
    global.slackWs = ws

    ws.onopen = () => {
        // @ts-ignore
        if (global.LIBRARY) {
            // @ts-ignore
            global.LIBRARY.hunt('[Console action] Update Console', {
                idx: 'cns00',
                src: `${prefix} Connected to slack WS: ${wsUrl}`,
            })
        }
        ws.send('Hello from slack Model')
    }

    ws.onmessage = (event: any) => {
        // @ts-ignore
        if (global.LIBRARY) {
            // @ts-ignore
            global.LIBRARY.hunt('[Console action] Update Console', {
                idx: 'cns00',
                src: `${prefix} WS Message: ${event.data}`,
            })
        }
    }

    ws.onerror = (error: any) => {
        // @ts-ignore
        if (global.LIBRARY) {
            // @ts-ignore
            global.LIBRARY.hunt('[Console action] Update Console', {
                idx: 'cns00',
                src: `${prefix} WS Error`,
            })
        }
    }

    ws.onclose = () => {
        // @ts-ignore
        if (global.LIBRARY) {
            // @ts-ignore
            global.LIBRARY.hunt('[Console action] Update Console', {
                idx: 'cns00',
                src: `${prefix} WS Connection Closed`,
            })
        }
    }

    if (bal.slv != null) bal.slv({ olmBit: { idx: 'connect-slack', lst: [] } })

    return cpy
}

export const disconnectSlack = (cpy: SlackModel, bal: slackBit, ste: State) => {
    // @ts-ignore
    if (global.slackWs) {
        // @ts-ignore
        global.slackWs.close()
        // @ts-ignore
        global.slackWs = null
    }

    // @ts-ignore
    if (global.localSlackProcess) {
        // @ts-ignore
        global.localSlackProcess.kill()
        // @ts-ignore
        global.localSlackProcess = null
    }

    // @ts-ignore
    if (global.LIBRARY) {
        // @ts-ignore
        global.LIBRARY.hunt('[Console action] Update Console', {
            idx: 'cns00',
            src: `Disconnected from slack`,
        })
    }

    if (bal.slv != null)
        bal.slv({ olmBit: { idx: 'disconnect-slack', lst: [] } })

    return cpy
}
