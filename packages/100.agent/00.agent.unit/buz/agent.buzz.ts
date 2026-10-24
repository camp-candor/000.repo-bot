import { AgentModel } from '../agent.model.js'
import agentBit from '../fce/agent.bit.js'
import State from '../../99.core/state.js'
import { getBaseUrl, getBaseWsUrl } from '../../src/cascade.js'

const agent = {
    list: async () => ({ models: [] as any[] }),
}

export const initagent = (cpy: AgentModel, bal: agentBit, ste: State) => {
    const healthUrl = `${getBaseUrl()}/health`
    fetch(healthUrl)
        .then((response) => response.json())
        .then((data) => {
            if (bal.slv != null) {
                bal.slv({
                    intBit: {
                        idx: 'init-agent',
                        dat: {
                            status: 'connected',
                            health: data,
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
    const isLocal =
        bal.src === 'LOCAL' || (global as any).agentBaseUrl?.includes('8787')
    const prefix = isLocal ? '[LOCAL WORKER]' : '[REMOTE WORKER]'
    const wsUrl = `${getBaseWsUrl()}/ws`

    if (isLocal) {
        ;(global as any).agentBaseUrl = 'http://127.0.0.1:8787'
    } else {
        delete (global as any).agentBaseUrl
    }

    // Idempotent Socket Guard: Do not re-create if already open
    if ((global as any).agentWs) {
        try {
            ;(global as any).agentWs.close(1000, 'Reconnecting')
        } catch (e) {}
        ;(global as any).agentWs = null
    }

    try {
        const ws = new WebSocket(wsUrl)
        ;(global as any).agentWs = ws

        ws.onopen = () => {
            if ((global as any).LIBRARY) {
                ;(global as any).LIBRARY.hunt(
                    '[Console action] Update Console',
                    {
                        idx: 'cns00',
                        src: `${prefix} Connected to agent WS: ${wsUrl}`,
                    },
                ).catch(() => {})
            }
            ws.send('Hello from agent Model')
        }

        ws.onmessage = (event: any) => {
            if ((global as any).LIBRARY) {
                ;(global as any).LIBRARY.hunt(
                    '[Console action] Update Console',
                    {
                        idx: 'cns00',
                        src: `${prefix} WS Message: ${event.data}`,
                    },
                ).catch(() => {})
            }
        }

        ws.onerror = (_error: any) => {
            if ((global as any).LIBRARY) {
                ;(global as any).LIBRARY.hunt(
                    '[Console action] Update Console',
                    {
                        idx: 'cns00',
                        src: `${prefix} WS Error encountered`,
                    },
                ).catch(() => {})
            }
        }

        ws.onclose = () => {
            if ((global as any).LIBRARY) {
                ;(global as any).LIBRARY.hunt(
                    '[Console action] Update Console',
                    {
                        idx: 'cns00',
                        src: `${prefix} WS Connection Closed`,
                    },
                ).catch(() => {})
            }
        }
    } catch (err: any) {
        if ((global as any).LIBRARY) {
            ;(global as any).LIBRARY.hunt('[Console action] Update Console', {
                idx: 'cns00',
                src: `${prefix} WS Initialization Error: ${err.message}`,
            }).catch(() => {})
        }
    }

    if (bal.slv != null) bal.slv({ olmBit: { idx: 'connect-agent', lst: [] } })
    return cpy
}

export const disconnectagent = (cpy: AgentModel, bal: agentBit, ste: State) => {
    if ((global as any).agentWs) {
        try {
            ;(global as any).agentWs.close(1000, 'User Disconnected')
        } catch (e) {}
        ;(global as any).agentWs = null
    }

    if ((global as any).localagentProcess) {
        try {
            ;(global as any).localagentProcess.kill()
        } catch (e) {}
        ;(global as any).localagentProcess = null
    }

    delete (global as any).agentBaseUrl

    if ((global as any).LIBRARY) {
        ;(global as any).LIBRARY.hunt('[Console action] Update Console', {
            idx: 'cns00',
            src: 'Disconnected from agent control plane',
        }).catch(() => {})
    }

    if (bal.slv != null)
        bal.slv({ olmBit: { idx: 'disconnect-agent', lst: [] } })

    return cpy
}
