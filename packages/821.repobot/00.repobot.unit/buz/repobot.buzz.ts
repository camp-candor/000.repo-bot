import { RepobotModel } from '../repobot.model.js'
import repobotBit from '../fce/repobot.bit.js'
import State from '../../99.core/state.js'

export const getBaseUrl = (): string => {
    return (
        (global as any).agentBaseUrl ||
        (global as any).repobotBaseUrl ||
        process.env.LIVE_WORKER_URL ||
        process.env.WORKER_URL ||
        'https://repo-bot-00.berad4000.workers.dev'
    ).replace(/\/$/, '')
}

const repobot = {
    list: async () => ({ models: [] as any[] }),
}

export const initRepobot = (cpy: RepobotModel, bal: repobotBit, ste: State) => {
    if (bal.slv != null) bal.slv({ intBit: { idx: 'init-repobot' } })
    return cpy
}

export const updateRepobot = (
    cpy: RepobotModel,
    bal: repobotBit,
    ste: State,
) => {
    if (bal.slv != null) bal.slv({ intBit: { idx: 'update-repobot' } })
    return cpy
}

export const testRepobot = async (
    cpy: RepobotModel,
    bal: repobotBit,
    ste: State,
) => {
    const owner = 'camp-candor'
    const repo = '000.repo-bot'
    const baseUrl = getBaseUrl()

    const endpoint = `${baseUrl}/repobot/inspect?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`

    try {
        // @ts-ignore
        if (global.LIBRARY) {
            // @ts-ignore
            await global.LIBRARY.hunt('[Console action] Update Console', {
                idx: 'cns00',
                src: `>> [AI GATEWAY] Querying AI Agent Worker via Cloudflare AI Gateway...`,
            })
        }

        const res = await fetch(endpoint)
        if (!res.ok) {
            const errText = await res.text()
            throw new Error(`Worker HTTP ${res.status}: ${errText}`)
        }

        const inspectData = await res.json()

        // @ts-ignore
        if (global.LIBRARY) {
            const formatted = JSON.stringify(inspectData, null, 2)
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
                src: `>> [AI GATEWAY RECEIPT] Status: ${inspectData?.checks?.all_passed ? 'ALL PASSED' : 'CHECKS PENDING/FAILED'}`,
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
                    idx: 'test-repobot',
                    val: 1,
                    dat: inspectData,
                },
            })
        }
    } catch (err: any) {
        // @ts-ignore
        if (global.LIBRARY) {
            // @ts-ignore
            await global.LIBRARY.hunt('[Console action] Update Console', {
                idx: 'cns00',
                src: `>> [INSPECT ERROR] ${err.message}`,
            })
        }

        if (bal.slv != null) {
            bal.slv({
                mytBit: {
                    idx: 'test-repobot-err',
                    val: 0,
                    dat: { error: err.message },
                },
            })
        }
    }

    return cpy
}

export const listRepobot = async (
    cpy: RepobotModel,
    bal: repobotBit,
    ste: State,
) => {
    const response = await repobot.list()
    if (bal.slv != null)
        bal.slv({
            olmBit: {
                idx: 'list-repobot',
                lst: response.models.map((m: any) => m.name),
            },
        })
    return cpy
}

export const connectRepobot = (
    cpy: RepobotModel,
    bal: repobotBit,
    ste: State,
) => {
    const isLocal = bal.src === 'LOCAL'
    const wsUrl = isLocal
        ? 'ws://localhost:8787/ws'
        : 'wss://worker-agent.berad4000.workers.dev/ws'
    const prefix = isLocal ? '[LOCAL WORKER]' : '[REMOTE WORKER]'

    // @ts-ignore
    global.repobotBaseUrl = isLocal
        ? 'http://localhost:8787'
        : 'https://worker-agent.berad4000.workers.dev'

    // @ts-ignore
    const ws = new WebSocket(wsUrl)

    // @ts-ignore
    global.repobotWs = ws

    ws.onopen = () => {
        // @ts-ignore
        if (global.LIBRARY) {
            // @ts-ignore
            global.LIBRARY.hunt('[Console action] Update Console', {
                idx: 'cns00',
                src: `${prefix} Connected to repobot WS: ${wsUrl}`,
            })
        }
        ws.send('Hello from repobot Model')
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

    if (bal.slv != null)
        bal.slv({ olmBit: { idx: 'connect-repobot', lst: [] } })

    return cpy
}

export const disconnectRepobot = (
    cpy: RepobotModel,
    bal: repobotBit,
    ste: State,
) => {
    // @ts-ignore
    if (global.repobotWs) {
        // @ts-ignore
        global.repobotWs.close()
        // @ts-ignore
        global.repobotWs = null
    }

    // @ts-ignore
    if (global.localRepobotProcess) {
        // @ts-ignore
        global.localRepobotProcess.kill()
        // @ts-ignore
        global.localRepobotProcess = null
    }

    // @ts-ignore
    if (global.LIBRARY) {
        // @ts-ignore
        global.LIBRARY.hunt('[Console action] Update Console', {
            idx: 'cns00',
            src: `Disconnected from repobot`,
        })
    }

    if (bal.slv != null)
        bal.slv({ olmBit: { idx: 'disconnect-repobot', lst: [] } })

    return cpy
}

export const getBaseUrl = (): string => {
    return (
        (global as any).agentBaseUrl ||
        (global as any).repobotBaseUrl ||
        process.env.LIVE_WORKER_URL ||
        process.env.WORKER_URL ||
        'https://repo-bot-00.berad4000.workers.dev'
    ).replace(/\/$/, '')
}
