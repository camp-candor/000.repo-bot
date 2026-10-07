import { parentPort, isMainThread } from 'node:worker_threads'

export interface HardwareMetrics {
    vramFreeMb?: number
    activeNode?: string
}

export interface TelemetryStartPayload {
    type: 'START'
    heartbeatUrl: string
    taskId: string
    workerId: string
    epoch: number
    intervalMs?: number
    initialMetrics?: HardwareMetrics
}

export interface TelemetryUpdateMetricsPayload {
    type: 'UPDATE_METRICS'
    metrics: HardwareMetrics
}

export interface TelemetryStopPayload {
    type: 'STOP'
}

export type TelemetryInboundMessage =
    TelemetryStartPayload | TelemetryUpdateMetricsPayload | TelemetryStopPayload

let activeTimer: NodeJS.Timeout | null = null
let currentMetrics: HardwareMetrics = {
    vramFreeMb: 24576,
    activeNode: 'IDLE',
}

/**
 * Worker thread execution logic. Runs decoupled from main event loop.
 */
export function setupWorkerThread(port = parentPort): void {
    if (!port) {
        return
    }

    port.on('message', async (message: TelemetryInboundMessage) => {
        if (message.type === 'START') {
            const {
                heartbeatUrl,
                taskId,
                workerId,
                epoch,
                intervalMs = 10_000,
                initialMetrics,
            } = message

            if (initialMetrics) {
                currentMetrics = { ...currentMetrics, ...initialMetrics }
            }

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
                            vramFreeMb: currentMetrics.vramFreeMb ?? 24576,
                            activeNode: currentMetrics.activeNode ?? 'IDLE',
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
                        // Stale epoch detected upstream - worker declared a zombie
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

            // Immediate first pulse, followed by steady interval
            await sendPulse()
            activeTimer = setInterval(sendPulse, intervalMs)
        } else if (message.type === 'UPDATE_METRICS') {
            currentMetrics = { ...currentMetrics, ...message.metrics }
        } else if (message.type === 'STOP') {
            if (activeTimer) {
                clearInterval(activeTimer)
                activeTimer = null
            }
            port.postMessage({ type: 'STOPPED', timestampMs: Date.now() })
        }
    })
}

// Bootstrap when invoked inside Worker thread context
if (!isMainThread) {
    setupWorkerThread()
}
