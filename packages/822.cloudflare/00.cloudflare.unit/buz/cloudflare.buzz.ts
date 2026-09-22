import { CloudflareModel } from '../cloudflare.model.js'
import cloudflareBit from '../fce/cloudflare.bit.js'
import State from '../../99.core/state.js'

const cloudflare = {
    list: async () => ({ models: [] as any[] }),
}

export const initCloudflare = (
    cpy: CloudflareModel,
    bal: cloudflareBit,
    ste: State,
) => {
    if (bal.slv != null) bal.slv({ intBit: { idx: 'init-cloudflare' } })
    return cpy
}

export const updateCloudflare = (
    cpy: CloudflareModel,
    bal: cloudflareBit,
    ste: State,
) => {
    if (bal.slv != null) bal.slv({ intBit: { idx: 'update-cloudflare' } })
    return cpy
}

export const testCloudflare = async (
    cpy: CloudflareModel,
    bal: cloudflareBit,
    ste: State,
) => {
    const owner = 'camp-candor'
    const repo = '000.repo-bot'
    const baseUrl = (
        (global as any).cloudflareBaseUrl ||
        process.env.LIVE_WORKER_URL ||
        process.env.WORKER_URL ||
        'http://127.0.0.1:8787'
    ).replace(/\/$/, '')

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
                    idx: 'test-cloudflare',
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
                    idx: 'test-cloudflare-err',
                    val: 0,
                    dat: { error: err.message },
                },
            })
        }
    }

    return cpy
}

export const listCloudflare = async (
    cpy: CloudflareModel,
    bal: cloudflareBit,
    ste: State,
) => {
    const response = await cloudflare.list()
    if (bal.slv != null)
        bal.slv({
            olmBit: {
                idx: 'list-cloudflare',
                lst: response.models.map((m: any) => m.name),
            },
        })
    return cpy
}

export const connectCloudflare = (
    cpy: CloudflareModel,
    bal: cloudflareBit,
    ste: State,
) => {
    const isLocal = bal.src === 'LOCAL'
    const wsUrl = isLocal
        ? 'ws://localhost:8787/ws'
        : 'wss://worker-agent.berad4000.workers.dev/ws'
    const prefix = isLocal ? '[LOCAL WORKER]' : '[REMOTE WORKER]'

    // @ts-ignore
    global.cloudflareBaseUrl = isLocal
        ? 'http://localhost:8787'
        : 'https://worker-agent.berad4000.workers.dev'

    // @ts-ignore
    const ws = new WebSocket(wsUrl)

    // @ts-ignore
    global.cloudflareWs = ws

    ws.onopen = () => {
        // @ts-ignore
        if (global.LIBRARY) {
            // @ts-ignore
            global.LIBRARY.hunt('[Console action] Update Console', {
                idx: 'cns00',
                src: `${prefix} Connected to cloudflare WS: ${wsUrl}`,
            })
        }
        ws.send('Hello from cloudflare Model')
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
        bal.slv({ olmBit: { idx: 'connect-cloudflare', lst: [] } })

    return cpy
}

export const disconnectCloudflare = (
    cpy: CloudflareModel,
    bal: cloudflareBit,
    ste: State,
) => {
    // @ts-ignore
    if (global.cloudflareWs) {
        // @ts-ignore
        global.cloudflareWs.close()
        // @ts-ignore
        global.cloudflareWs = null
    }

    // @ts-ignore
    if (global.localCloudflareProcess) {
        // @ts-ignore
        global.localCloudflareProcess.kill()
        // @ts-ignore
        global.localCloudflareProcess = null
    }

    // @ts-ignore
    if (global.LIBRARY) {
        // @ts-ignore
        global.LIBRARY.hunt('[Console action] Update Console', {
            idx: 'cns00',
            src: `Disconnected from cloudflare`,
        })
    }

    if (bal.slv != null)
        bal.slv({ olmBit: { idx: 'disconnect-cloudflare', lst: [] } })

    return cpy
}
