import { parentPort, isMainThread } from 'node:worker_threads'

export interface HeartbeatStartPayload {
    type: 'START'
    heartbeatUrl: string
    taskId: string
    workerId: string
    epoch: number
    intervalMs?: number
}

export interface HeartbeatStopPayload {
    type: 'STOP'
}

export type HeartbeatInboundMessage =
    HeartbeatStartPayload | HeartbeatStopPayload

let activeTimer: NodeJS.Timeout | null = null

/**
 * Worker thread execution logic. Runs decoupled from main event loop.
 */
export function setupWorkerThread(port = parentPort): void {
    if (!port) {
        return
    }

    port.on('message', async (message: HeartbeatInboundMessage) => {
        if (message.type === 'START') {
            const {
                heartbeatUrl,
                taskId,
                workerId,
                epoch,
                intervalMs = 10_000,
            } = message

            if (activeTimer) {
                clearInterval(activeTimer)
                activeTimer = null
            }

            const sendPulse = async () => {
                try {
                    const response = await fetch(heartbeatUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            taskId,
                            workerId,
                            epoch,
                            timestampMs: Date.now(),
                        }),
                    })

                    if (response.status === 200) {
                        port.postMessage({
                            type: 'PULSE_ACK',
                            epoch,
                            timestampMs: Date.now(),
                        })
                    } else if (response.status === 409) {
                        // Stale epoch detected upstream - worker is declared a zombie
                        const data = (await response
                            .json()
                            .catch(() => ({}))) as any
                        port.postMessage({
                            type: 'ZOMBIE_FENCED',
                            status: 409,
                            epoch,
                            error: data.error || 'STALE_EPOCH_ZOMBIE',
                            timestampMs: Date.now(),
                        })

                        if (activeTimer) {
                            clearInterval(activeTimer)
                            activeTimer = null
                        }
                    } else {
                        port.postMessage({
                            type: 'PULSE_ERROR',
                            status: response.status,
                            message: `UNEXPECTED_STATUS_${response.status}`,
                            timestampMs: Date.now(),
                        })
                    }
                } catch (err: any) {
                    port.postMessage({
                        type: 'PULSE_ERROR',
                        status: 0,
                        message: err?.message || String(err),
                        timestampMs: Date.now(),
                    })
                }
            }

            // Execute immediate first pulse, then arm regular interval
            await sendPulse()
            activeTimer = setInterval(sendPulse, intervalMs)
        } else if (message.type === 'STOP') {
            if (activeTimer) {
                clearInterval(activeTimer)
                activeTimer = null
            }
            port.postMessage({ type: 'STOPPED', timestampMs: Date.now() })
        }
    })
}

// Auto-bootstrap when invoked as a Worker thread
if (!isMainThread) {
    setupWorkerThread()
}
