import fs from 'node:fs'
import path from 'node:path'
import { type ChildProcess } from 'node:child_process'
import { TelemetryManager } from '../telemetry/telemetryManager.js'
import type { HardwareMetrics } from '../telemetry/telemetryWorker.js'

export interface GpuMutexInterface {
    acquireLock(): boolean
    releaseLock(): void
    isLocked(): boolean
}

export class GpuHardwareMutex implements GpuMutexInterface {
    private lockFd: number | null = null

    constructor(private lockFilePath = '/var/lock/rig2_gpu.lock') {}

    public acquireLock(): boolean {
        if (this.lockFd !== null) {
            return true
        }

        try {
            const dir = path.dirname(this.lockFilePath)
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true })
            }

            this.lockFd = fs.openSync(this.lockFilePath, 'w')
            return true
        } catch (err: any) {
            console.error(
                `>> [MUTEX:ERR] Failed to acquire OS lock: ${err.message}`,
            )
            return false
        }
    }

    public releaseLock(): void {
        if (this.lockFd === null) {
            return
        }

        try {
            fs.closeSync(this.lockFd)
        } catch {
            // Ignore close issues
        } finally {
            this.lockFd = null
            console.log(
                '>> [MUTEX:RELEASE] Released GPU file descriptor lock [OK]',
            )
        }
    }

    public isLocked(): boolean {
        return this.lockFd !== null
    }
}

export interface TaskPayload {
    taskId: string
    workerId: string
    epoch: number
    heartbeatUrl: string
    stagingDir: string
    attemptCount?: number
    maxAttempts?: number
    heartbeatIntervalMs?: number
    initialMetrics?: HardwareMetrics
}

export interface ExecutionResult {
    success: boolean
    aborted: boolean
    circuitBreakerTripped?: boolean
    error?: string
    outputFilePath?: string
}

export class MediaBrokerRunner {
    private telemetryManager: TelemetryManager
    private activeProcess: ChildProcess | null = null

    constructor(
        private gpuMutex: GpuMutexInterface = new GpuHardwareMutex(),
        telemetryManager?: TelemetryManager,
    ) {
        this.telemetryManager = telemetryManager || new TelemetryManager()
    }

    /**
     * Executes the task lifecycle with detached telemetry guarding and Three-Cycle circuit breakers.
     */
    public async executeTask(
        payload: TaskPayload,
        processSpawner: (
            abortSignal: AbortSignal,
        ) => Promise<{ process?: ChildProcess; outputPath: string }>,
    ): Promise<ExecutionResult> {
        const attemptCount = payload.attemptCount ?? 1
        const maxAttempts = payload.maxAttempts ?? 3

        // 1. Three-Cycle Escalation Circuit Breaker Gate
        if (attemptCount >= maxAttempts) {
            console.error(
                `>> [CIRCUIT_BREAKER:TRIP] Task '${payload.taskId}' reached maximum attempts (${attemptCount}/${maxAttempts}). Quarantined [HALT]`,
            )
            return {
                success: false,
                aborted: true,
                circuitBreakerTripped: true,
                error: `CIRCUIT_BREAKER_TRIPPED: Max attempts (${maxAttempts}) reached.`,
            }
        }

        // 2. Hardware Sovereignty Lock
        if (!this.gpuMutex.acquireLock()) {
            throw new Error(
                `GPU_HARDWARE_OCCUPIED: Unable to acquire hardware lock for task '${payload.taskId}'`,
            )
        }

        console.log(
            `>> [RUNNER:LOCK] Acquired local GPU hardware mutex for task '${payload.taskId}' [OK]`,
        )

        // 3. Prepare Scratch Directories
        if (!fs.existsSync(payload.stagingDir)) {
            fs.mkdirSync(payload.stagingDir, { recursive: true })
        }

        const abortController = new AbortController()
        let wasAborted = false
        let abortReason = ''

        // 4. Register Zombie Fencing Handler
        const handleZombieFenced = async (fenceData: {
            epoch: number
            error: string
        }) => {
            wasAborted = true
            abortReason = fenceData.error
            console.error(
                `>> [ZOMBIE:ABORT] Received 409 Conflict for Epoch ${fenceData.epoch}. Killing local processes [REVERT]`,
            )

            abortController.abort()

            // Forcefully terminate active child process
            if (this.activeProcess && !this.activeProcess.killed) {
                try {
                    this.activeProcess.kill('SIGKILL')
                    console.log(
                        `>> [ZOMBIE:KILL] Child process ${this.activeProcess.pid} forcefully terminated [OK]`,
                    )
                } catch (err: any) {
                    console.warn(
                        `>> [ZOMBIE:WARN] Failed to terminate child process: ${err.message}`,
                    )
                }
            }

            // Evict staging scratch artifacts
            try {
                if (fs.existsSync(payload.stagingDir)) {
                    fs.rmSync(payload.stagingDir, {
                        recursive: true,
                        force: true,
                    })
                    console.log(
                        `>> [SCRATCH:PURGE] Purged zombie staging directory '${payload.stagingDir}' [OK]`,
                    )
                }
            } catch (rmErr: any) {
                console.warn(
                    `>> [SCRATCH:ERR] Scratch purge warning: ${rmErr.message}`,
                )
            }

            // Surrender hardware mutex immediately
            this.gpuMutex.releaseLock()
        }

        // 5. Start Detached Telemetry Heartbeat Loop
        this.telemetryManager.start(
            {
                heartbeatUrl: payload.heartbeatUrl,
                taskId: payload.taskId,
                workerId: payload.workerId,
                epoch: payload.epoch,
                intervalMs: payload.heartbeatIntervalMs || 10_000,
                initialMetrics: payload.initialMetrics,
            },
            {
                onPulseAck: (data) => {
                    console.log(
                        `>> [TELEMETRY:ACK] Pulse acknowledged by edge DO (Epoch: ${data.epoch}) [OK]`,
                    )
                },
                onZombieFenced: handleZombieFenced,
            },
        )

        try {
            // 6. Execute Hardware Workload
            const { process: childProc, outputPath } = await processSpawner(
                abortController.signal,
            )
            this.activeProcess = childProc || null

            if (abortController.signal.aborted || wasAborted) {
                return {
                    success: false,
                    aborted: true,
                    error: abortReason || 'TASK_ABORTED_BY_SIGNAL',
                }
            }

            // 7. Stop Telemetry Thread on Completion
            await this.telemetryManager.stop()

            return {
                success: true,
                aborted: false,
                outputFilePath: outputPath,
            }
        } catch (err: any) {
            await this.telemetryManager.stop()

            if (wasAborted || abortController.signal.aborted) {
                return {
                    success: false,
                    aborted: true,
                    error: abortReason || 'TASK_ABORTED_BY_SIGNAL',
                }
            }

            console.error(
                `>> [RUNNER:FAIL] Task execution error: ${err.message} [FAIL]`,
            )
            return {
                success: false,
                aborted: false,
                error: err.message,
            }
        } finally {
            this.activeProcess = null
            if (this.gpuMutex.isLocked()) {
                this.gpuMutex.releaseLock()
            }
        }
    }

    public updateTelemetryMetrics(metrics: HardwareMetrics): void {
        this.telemetryManager.updateMetrics(metrics)
    }
}
