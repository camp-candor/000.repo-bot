import type { RepobotModel } from '../repobot.model.js'
import type RepobotBit from '../fce/repobot.bit.js'
import type State from '../../99.core/state.js'

export const initRepobot = (
    cpy: RepobotModel,
    bal?: RepobotBit,
    _ste?: State,
): RepobotModel => {
    if (bal?.slv) bal.slv({ rbtBit: { idx: 'init-repobot', val: 1 } })
    return cpy
}

export const updateRepobot = (
    cpy: RepobotModel,
    bal?: RepobotBit,
    _ste?: State,
): RepobotModel => {
    if (bal?.slv) bal.slv({ rbtBit: { idx: 'update-repobot', val: 1 } })
    return cpy
}

export const connectRepobot = async (
    cpy: RepobotModel,
    bal?: RepobotBit,
    _ste?: State,
): Promise<RepobotModel> => {
    cpy.connectionState = 'CONNECTING'
    const isLocal = bal?.src === 'LOCAL'
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
    cpy.ws = ws

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

    if (bal?.slv) bal.slv({ rbtBit: { idx: 'connect-repobot', val: 1 } })
    return cpy
}

export const disconnectRepobot = async (
    cpy: RepobotModel,
    bal?: RepobotBit,
    _ste?: State,
): Promise<RepobotModel> => {
    if (cpy.reconnectTimer) {
        clearTimeout(cpy.reconnectTimer)
        cpy.reconnectTimer = null
    }
    cpy.connectionState = 'DISCONNECTED'
    cpy.reconnectAttempts = 0
    if (cpy.ws) {
        try {
            cpy.ws.close(1000, 'Disconnect requested')
        } catch {}
        cpy.ws = null
    }

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

    if (bal?.slv) bal.slv({ rbtBit: { idx: 'disconnect-repobot', val: 1 } })
    return cpy
}
