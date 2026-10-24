import type { RepobotModel } from '../repobot.model.js'
import type RepobotBit from '../fce/repobot.bit.js'
import type State from '../../99.core/state.js'

const UPDATE_CONSOLE = '[Console action] Update Console'

/**
 * Resolves the active worker endpoint following the 4-tier monorepo target cascade.
 */
export const getBaseUrl = (): string => {
    return (
        (global as any).agentBaseUrl ||
        (global as any).repobotBaseUrl ||
        process.env.LIVE_WORKER_URL ||
        process.env.WORKER_URL ||
        'https://repo-bot-00.berad4000.workers.dev'
    ).replace(/\/$/, '')
}

/**
 * Helper to emit 7-bit clean ASCII telemetry into Blessed console widget cns00.
 */
async function streamLog(ste: State | undefined, text: string): Promise<void> {
    const lib = (globalThis as any).LIBRARY || (global as any).LIBRARY
    if (lib && typeof lib.hunt === 'function') {
        await lib.hunt(UPDATE_CONSOLE, {
            idx: 'cns00',
            src: text,
        })
    } else if (ste?.hunt) {
        await ste.hunt(UPDATE_CONSOLE, {
            idx: 'cns00',
            src: text,
        })
    }
}

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

/**
 * CONNECT REPOBOT:
 * Establishes a persistent, self-healing WebSocket telemetry connection
 * with historical backlog replay (K=10) and monotonic sequence tracking.
 */
export const connectRepobot = async (
    cpy: RepobotModel,
    bal?: RepobotBit,
    ste?: State,
): Promise<RepobotModel> => {
    // 1. Prevent duplicate connections if socket is already active
    if (
        cpy.ws &&
        (cpy.connectionState === 'CONNECTED' ||
            cpy.connectionState === 'CONNECTING')
    ) {
        await streamLog(
            ste,
            '>> [WS] Connection already active. Skipping re-connect.',
        )
        if (bal?.slv)
            bal.slv({ rbtBit: { idx: 'connect-repobot-noop', val: 1 } })
        return cpy
    }

    // 2. Resolve WebSocket endpoint via target cascade
    const httpUrl = bal?.dat?.url || getBaseUrl()
    const wsUrl = httpUrl.replace(/^http/, 'ws') + '/ws/telemetry?role=operator'
    cpy.activeBaseUrl = httpUrl
    cpy.connectionState = 'CONNECTING'

    await streamLog(ste, `>> [WS] Dialing Edge Telemetry Tunnel: ${wsUrl}`)

    try {
        const socket = new WebSocket(wsUrl)
        cpy.ws = socket

        // --- ON OPEN ---
        socket.onopen = async () => {
            cpy.connectionState = 'CONNECTED'
            cpy.reconnectAttempts = 0
            if (cpy.reconnectTimer) {
                clearTimeout(cpy.reconnectTimer)
                cpy.reconnectTimer = null
            }

            await streamLog(
                ste,
                '>> ==============================================================',
            )
            await streamLog(
                ste,
                '>> [WS OK] REPO-BOT TELEMETRY TUNNEL SECURED (Edge Hibernation Active)',
            )
            await streamLog(
                ste,
                '>> ==============================================================',
            )

            if (bal?.slv) {
                bal.slv({
                    rbtBit: { idx: 'connect-repobot-success', val: 1 },
                })
            }
        }

        // --- ON MESSAGE ---
        socket.onmessage = async (event: MessageEvent) => {
            try {
                const data = JSON.parse(event.data.toString())

                // 1. Historical Telemetry Replay Envelope (TASK-23.8.3 & TASK-23.8.4)
                if (
                    data.type === 'TELEMETRY_HISTORY' &&
                    Array.isArray(data.payload?.items)
                ) {
                    const items: any[] = data.payload.items

                    // Synchronize monotonic sequence counter to highest replayed sequence
                    for (const item of items) {
                        if (
                            typeof item.seq === 'number' &&
                            item.seq > cpy.lastSeqReceived
                        ) {
                            cpy.lastSeqReceived = item.seq
                        }
                    }
                    if (
                        typeof data.seq === 'number' &&
                        data.seq > cpy.lastSeqReceived
                    ) {
                        cpy.lastSeqReceived = data.seq
                    }

                    if (items.length > 0) {
                        await streamLog(
                            ste,
                            '>> --------------------------------------------------------------',
                        )
                        await streamLog(
                            ste,
                            `>> [TELEMETRY REPLAY] RESTORING LAST ${items.length} HISTORICAL EDGE EVENT(S)`,
                        )
                        await streamLog(
                            ste,
                            '>> --------------------------------------------------------------',
                        )

                        for (const item of items) {
                            if (item.ascii) {
                                await streamLog(ste, item.ascii)
                            } else if (item.type && item.payload) {
                                await streamLog(
                                    ste,
                                    `>> [${item.type}] ${JSON.stringify(item.payload)}`,
                                )
                            }
                        }

                        await streamLog(
                            ste,
                            '>> --------------------------------------------------------------',
                        )
                        await streamLog(
                            ste,
                            '>> [LIVE STREAM ENGAGED] Telemetry tunnel active. Listening...',
                        )
                        await streamLog(
                            ste,
                            '>> --------------------------------------------------------------',
                        )
                    }
                    return
                }

                // 2. Standard Real-Time Telemetry Packet Handling
                if (typeof data.seq === 'number') {
                    if (
                        cpy.lastSeqReceived > 0 &&
                        data.seq > cpy.lastSeqReceived + 1
                    ) {
                        const dropped = data.seq - cpy.lastSeqReceived - 1
                        await streamLog(
                            ste,
                            `>> [WARN] Dropped ${dropped} telemetry frame(s) during transit.`,
                        )
                    }
                    cpy.lastSeqReceived = data.seq
                }

                // Render pre-formatted ASCII frame to cns00
                if (data.ascii) {
                    await streamLog(ste, data.ascii)
                } else if (data.type && data.payload) {
                    await streamLog(
                        ste,
                        `>> [${data.type}] ${JSON.stringify(data.payload)}`,
                    )
                }
            } catch (err: any) {
                await streamLog(
                    ste,
                    `>> [PARSE ERROR] Corrupt telemetry packet: ${err.message}`,
                )
            }
        }

        // --- ON CLOSE ---
        socket.onclose = async (event: CloseEvent) => {
            cpy.ws = null

            // If disconnected intentionally by operator, halt reconnect loop
            if (cpy.connectionState === 'DISCONNECTED') {
                await streamLog(
                    ste,
                    '>> [WS] Telemetry session closed cleanly.',
                )
                return
            }

            cpy.connectionState = 'RECONNECTING'
            await streamLog(
                ste,
                `>> [WS WARN] Tunnel disconnected (Code: ${event.code}). Initiating backoff...`,
            )

            // Exponential backoff with ceiling
            const backoff = Math.min(
                1000 * Math.pow(2, cpy.reconnectAttempts),
                cpy.maxReconnectDelayMs,
            )
            cpy.reconnectAttempts++

            cpy.reconnectTimer = setTimeout(() => {
                connectRepobot(cpy, {}, ste)
            }, backoff)
        }

        // --- ON ERROR ---
        socket.onerror = async () => {
            await streamLog(
                ste,
                '>> [WS FAIL] Socket network exception encountered.',
            )
        }
    } catch (err: any) {
        cpy.connectionState = 'DISCONNECTED'
        await streamLog(
            ste,
            `>> [WS FATAL] Ingress initialization failure: ${err.message}`,
        )
        if (bal?.slv) {
            bal.slv({
                rbtBit: {
                    idx: 'connect-repobot-error',
                    src: err.message,
                    val: 0,
                },
            })
        }
    }

    return cpy
}

/**
 * DISCONNECT REPOBOT:
 * Cleanly closes the active WebSocket connection and cancels all reconnection timers.
 */
export const disconnectRepobot = async (
    cpy: RepobotModel,
    bal?: RepobotBit,
    ste?: State,
): Promise<RepobotModel> => {
    // 1. Clear active reconnect timer
    if (cpy.reconnectTimer) {
        clearTimeout(cpy.reconnectTimer)
        cpy.reconnectTimer = null
    }

    // 2. Mark intentional disconnect state
    cpy.connectionState = 'DISCONNECTED'
    cpy.reconnectAttempts = 0

    // 3. Gracefully close active socket handle
    if (cpy.ws) {
        try {
            cpy.ws.close(1000, 'Operator requested disconnect')
        } catch {}
        cpy.ws = null
    }

    await streamLog(
        ste,
        '>> [WS] Telemetry tunnel disconnected. Reconnect daemon disengaged.',
    )

    if (bal?.slv) {
        bal.slv({
            rbtBit: { idx: 'disconnect-repobot-success', val: 1 },
        })
    }

    return cpy
}
