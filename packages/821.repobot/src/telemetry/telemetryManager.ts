import { Worker } from 'node:worker_threads'
import fs from 'node:fs'
import path from 'node:path'
import type { HardwareMetrics } from './telemetryWorker.js'

export interface TelemetryConfig {
    heartbeatUrl: string
    taskId: string
    workerId: string
    epoch: number
    intervalMs?: number
    workerScriptPath?: string
    initialMetrics?: HardwareMetrics
}

export interface TelemetryCallbacks {
    onPulseAck?: (data: { epoch: number; timestampMs: number }) => void
    onZombieFenced: (data: {
        epoch: number
        error: string
        status: number
    }) => void
    onError?: (data: { status: number; message: string }) => void
}

/**
 * Inline worker script fallback for execution in Vitest / unbundled runtimes.
 */
export const INLINE_TELEMETRY_WORKER_SCRIPT = `
const { parentPort } = require('node:worker_threads');
let activeTimer = null;
let currentMetrics = { vramFreeMb: 24576, activeNode: 'IDLE' };

parentPort.on('message', async (message) => {
    if (message.type === 'START') {
        const { heartbeatUrl, taskId, workerId, epoch, intervalMs = 10000, initialMetrics } = message;
        if (initialMetrics) currentMetrics = { ...currentMetrics, ...initialMetrics };
        if (activeTimer) clearInterval(activeTimer);

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
                        timestampMs: Date.now()
                    }),
                });

                if (response.status === 200) {
                    parentPort.postMessage({ type: 'PULSE_ACK', epoch, timestampMs: Date.now() });
                } else if (response.status === 409) {
                    const data = await response.json().catch(() => ({}));
                    parentPort.postMessage({
                        type: 'ZOMBIE_FENCED',
                        status: 409,
                        epoch,
                        error: data.error || 'STALE_EPOCH_ZOMBIE',
                        timestampMs: Date.now()
                    });
                    if (activeTimer) { clearInterval(activeTimer); activeTimer = null; }
                } else {
                    parentPort.postMessage({
                        type: 'PULSE_ERROR',
                        status: response.status,
                        message: 'HTTP_' + response.status,
                        timestampMs: Date.now()
                    });
                }
            } catch (err) {
                parentPort.postMessage({
                        type: 'PULSE_ERROR',
                        status: 0,
                        message: err.message || String(err),
                        timestampMs: Date.now()
                });
            }
        };

        await sendPulse();
        activeTimer = setInterval(sendPulse, intervalMs);
    } else if (message.type === 'UPDATE_METRICS') {
        currentMetrics = { ...currentMetrics, ...message.metrics };
    } else if (message.type === 'STOP') {
        if (activeTimer) { clearInterval(activeTimer); activeTimer = null; }
        parentPort.postMessage({ type: 'STOPPED' });
    }
});
`

export class TelemetryManager {
    private worker: Worker | null = null
    private isRunning = false

    /**
     * Spawns worker thread and initiates detached telemetry pulses.
     */
    public start(config: TelemetryConfig, callbacks: TelemetryCallbacks): void {
        if (this.isRunning) {
            console.warn(
                '>> [TELEMETRY:WARN] Manager already active; restarting thread.',
            )
            this.stopSync()
        }

        const scriptPath =
            config.workerScriptPath ||
            path.resolve(__dirname, 'telemetryWorker.js')

        if (fs.existsSync(scriptPath)) {
            this.worker = new Worker(scriptPath)
        } else {
            this.worker = new Worker(INLINE_TELEMETRY_WORKER_SCRIPT, {
                eval: true,
            })
        }

        this.isRunning = true

        this.worker.on('message', (msg: any) => {
            if (msg.type === 'PULSE_ACK') {
                callbacks.onPulseAck?.(msg)
            } else if (msg.type === 'ZOMBIE_FENCED') {
                console.error(
                    `>> [TELEMETRY:ZOMBIE] Upstream epoch fencing conflict detected: ${msg.error} [HALT]`,
                )
                this.isRunning = false
                callbacks.onZombieFenced(msg)
            } else if (msg.type === 'PULSE_ERROR') {
                console.warn(
                    `>> [TELEMETRY:PULSE_ERR] Heartbeat network glitch: ${msg.message}`,
                )
                callbacks.onError?.(msg)
            }
        })

        this.worker.on('error', (err: any) => {
            console.error(
                `>> [TELEMETRY:THREAD_FAIL] Worker thread exception: ${err.message} [FAIL]`,
            )
        })

        this.worker.postMessage({
            type: 'START',
            heartbeatUrl: config.heartbeatUrl,
            taskId: config.taskId,
            workerId: config.workerId,
            epoch: config.epoch,
            intervalMs: config.intervalMs || 10_000,
            initialMetrics: config.initialMetrics,
        })

        console.log(
            `>> [TELEMETRY:START] Detached telemetry thread spawned for task '${config.taskId}' (Epoch: ${config.epoch}) [OK]`,
        )
    }

    /**
     * Updates active GPU hardware metrics transmitted to edge control plane.
     */
    public updateMetrics(metrics: HardwareMetrics): void {
        if (this.worker && this.isRunning) {
            this.worker.postMessage({
                type: 'UPDATE_METRICS',
                metrics,
            })
        }
    }

    /**
     * Gracefully stops the worker thread and releases resources.
     */
    public async stop(): Promise<void> {
        if (!this.worker) {
            return
        }

        this.isRunning = false

        return new Promise<void>((resolve) => {
            if (!this.worker) {
                resolve()
                return
            }

            const currentWorker = this.worker
            const timeout = setTimeout(() => {
                currentWorker.terminate().then(() => resolve())
            }, 1000)

            currentWorker.once('message', (msg) => {
                if (msg.type === 'STOPPED') {
                    clearTimeout(timeout)
                    currentWorker.terminate().then(() => resolve())
                }
            })

            currentWorker.postMessage({ type: 'STOP' })
            this.worker = null
        })
    }

    private stopSync(): void {
        if (this.worker) {
            this.worker.terminate()
            this.worker = null
            this.isRunning = false
        }
    }

    public isActive(): boolean {
        return this.isRunning
    }
}
