import type { JulesModel } from '../jules.model.js'
import type JulesBit from '../fce/jules.bit.js'
import type State from '../../99.core/state.js'

export const initJules = (cpy: JulesModel, bal: JulesBit, ste: State) => {
    if (bal.slv) bal.slv({ intBit: { idx: 'init-jules' } })
    return cpy
}

export const updateJules = (cpy: JulesModel, bal: JulesBit, ste: State) => {
    if (bal.slv) bal.slv({ intBit: { idx: 'update-jules' } })
    return cpy
}

export const dispatchJulesTask = async (
    cpy: JulesModel,
    bal: JulesBit,
    ste: State,
) => {
    const targetUrl = (global as any).agentBaseUrl || 'http://127.0.0.1:8787'

    try {
        const payload = {
            repo: bal.dat?.repo || '000.repo-bot',
            owner: bal.dat?.owner || 'camp-candor',
            taskId: bal.dat?.taskId || 'TASK-01',
            fileWhitelist: bal.dat?.fileWhitelist || [
                'apps/worker/src/index.ts',
            ],
            prompt: bal.src || 'Implement bounded specification update',
        }

        const res = await fetch(`${targetUrl}/api/jules/dispatch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        })

        const data = await res.json()
        if (res.ok && (data as any).sessionId) {
            cpy.lastDispatchedSessionId = (data as any).sessionId
            cpy.activeSessions[(data as any).sessionId] = data
        }

        if (bal.slv)
            bal.slv({ jlsBit: { idx: 'dispatch-jules-task', dat: data } })
    } catch (err: any) {
        if (bal.slv) {
            bal.slv({
                jlsBit: { idx: 'dispatch-jules-task-err', src: err.message },
            })
        }
    }
    return cpy
}

export const checkJulesStatus = async (
    cpy: JulesModel,
    bal: JulesBit,
    ste: State,
) => {
    const targetUrl = (global as any).agentBaseUrl || 'http://127.0.0.1:8787'
    const sessionId = bal.idx || cpy.lastDispatchedSessionId

    if (!sessionId) {
        if (bal.slv) {
            bal.slv({
                jlsBit: {
                    idx: 'check-jules-status-err',
                    src: 'No active session ID provided or stored',
                },
            })
        }
        return cpy
    }

    try {
        const res = await fetch(`${targetUrl}/api/jules/session/${sessionId}`)
        const data = await res.json()
        if (bal.slv)
            bal.slv({ jlsBit: { idx: 'check-jules-status', dat: data } })
    } catch (err: any) {
        if (bal.slv) {
            bal.slv({
                jlsBit: { idx: 'check-jules-status-err', src: err.message },
            })
        }
    }
    return cpy
}
