import { AgentModel } from '../agent.model.js'
import agentBit from '../fce/agent.bit.js'
import State from '../../99.core/state.js'

const agent = {
    list: async () => ({ models: [] as any[] }),
}

export const initagent = (cpy: AgentModel, bal: agentBit, ste: State) => {
    const url =
        process.env.agent_URL ||
        'https://zero00-agent.onrender.com/api/agent/test'
    if (url) {
        fetch(url)
            .then((response) => response.json())
            .then((data) => {
                if (bal.slv != null) {
                    bal.slv({
                        intBit: {
                            idx: 'init-agent',
                            dat: {
                                agent: data,
                            },
                        },
                    })
                }
            })
            .catch((error: any) => {
                if (bal.slv != null) {
                    bal.slv({
                        intBit: { idx: 'init-agent-err', dat: error.message },
                    })
                }
            })
    } else {
        if (bal.slv != null) {
            bal.slv({ intBit: { idx: 'init-agent' } })
        }
    }
    return cpy
}

export const updateagent = (cpy: AgentModel, bal: agentBit, ste: State) => {
    bal.slv({ intBit: { idx: 'update-agent' } })

    return cpy
}

export const testagent = (cpy: AgentModel, bal: agentBit, ste: State) => {
    bal.slv({ mytBit: { idx: 'test-agent', val: 1 } })
    return cpy
}

export const listagent = async (cpy: AgentModel, bal: agentBit, ste: State) => {
    const response = await agent.list()
    if (bal.slv != null)
        bal.slv({
            olmBit: {
                idx: 'list-agent',
                lst: response.models.map((m: any) => m.name),
            },
        })
    return cpy
}

export const connectagent = (cpy: AgentModel, bal: agentBit, ste: State) => {
    const isLocal = bal.src === 'LOCAL'
    const liveUrl = (
        process.env.LIVE_WORKER_URL ||
        process.env.WORKER_URL ||
        'https://repo-bot-00.berad4000.workers.dev'
    ).replace(/\/$/, '')
    const wsHost = liveUrl.replace(/^https?:\/\//, '')
    const wsUrl = isLocal ? 'ws://localhost:8787/ws' : `wss://${wsHost}/ws`
    const prefix = isLocal ? '[LOCAL WORKER]' : '[REMOTE WORKER]'

    if (isLocal) {
        // @ts-ignore
        global.agentBaseUrl = 'http://localhost:8787'
    } else {
        // @ts-ignore
        delete global.agentBaseUrl
    }

    // @ts-ignore
    const ws = new WebSocket(wsUrl)

    // @ts-ignore
    global.agentWs = ws

    ws.onopen = () => {
        // @ts-ignore
        if (global.LIBRARY) {
            // @ts-ignore
            global.LIBRARY.hunt('[Console action] Update Console', {
                idx: 'cns00',
                src: `${prefix} Connected to agent WS: ${wsUrl}`,
            })
        }
        ws.send('Hello from agent Model')
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

    if (bal.slv != null) bal.slv({ olmBit: { idx: 'connect-agent', lst: [] } })

    return cpy
}

export const disconnectagent = (cpy: AgentModel, bal: agentBit, ste: State) => {
    // @ts-ignore
    if (global.agentWs) {
        // @ts-ignore
        global.agentWs.close()
        // @ts-ignore
        global.agentWs = null
    }

    // @ts-ignore
    if (global.localagentProcess) {
        // @ts-ignore
        global.localagentProcess.kill()
        // @ts-ignore
        global.localagentProcess = null
    }

    // @ts-ignore
    if (global.LIBRARY) {
        // @ts-ignore
        global.LIBRARY.hunt('[Console action] Update Console', {
            idx: 'cns00',
            src: `Disconnected from agent`,
        })
    }

    if (bal.slv != null)
        bal.slv({ olmBit: { idx: 'disconnect-agent', lst: [] } })

    return cpy
}
