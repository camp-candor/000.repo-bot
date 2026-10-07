import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { EventEmitter } from 'node:events'
import { TelemetryManager } from '../../src/telemetry/telemetryManager.js'
import {
    MediaBrokerRunner,
    type GpuMutexInterface,
} from '../../src/execution/runner.js'

class MockGpuMutex implements GpuMutexInterface {
    public locked = false

    acquireLock(): boolean {
        this.locked = true
        return true
    }

    releaseLock(): void {
        this.locked = false
    }

    isLocked(): boolean {
        return this.locked
    }
}

class MockChildProcess extends EventEmitter {
    public killed = false
    public pid = 98765

    kill(signal = 'SIGTERM'): boolean {
        this.killed = true
        this.emit('close', 0, signal)
        return true
    }
}

describe('Thread-Isolated Telemetry & Watchdog Circuit Breakers Battery (Phase 4)', () => {
    const testDir = path.resolve(__dirname, '../../tmp/test-telemetry-scratch')

    beforeEach(() => {
        if (!fs.existsSync(testDir)) {
            fs.mkdirSync(testDir, { recursive: true })
        }
    })

    afterEach(() => {
        if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true, force: true })
        }
    })

    it('TASK-4.1: maintains independent heartbeat pulses without blocking during CPU-heavy main thread work', async () => {
        let heartbeatCount = 0
        let capturedPayload: any = null

        const http = require('node:http')
        const server = http.createServer((req: any, res: any) => {
            heartbeatCount++
            let body = ''
            req.on('data', (chunk: any) => {
                body += chunk.toString()
            })
            req.on('end', () => {
                capturedPayload = JSON.parse(body)
                res.writeHead(200, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ ok: true }))
            })
        })

        await new Promise<void>((resolve) =>
            server.listen(0, '127.0.0.1', () => resolve()),
        )
        const address = server.address() as any
        const port = address.port

        const manager = new TelemetryManager()
        const ackSpy = vi.fn()

        manager.start(
            {
                heartbeatUrl: `http://127.0.0.1:${port}/leases/heartbeat`,
                taskId: 'task-cpu-burn',
                workerId: 'rig2_gpu',
                epoch: 7,
                intervalMs: 50,
                initialMetrics: { vramFreeMb: 18420, activeNode: 'KSampler' },
            },
            {
                onPulseAck: ackSpy,
                onZombieFenced: vi.fn(),
            },
        )

        // Wait for first pulse to complete so worker starts the interval timer
        await new Promise<void>((resolve) => {
            const check = setInterval(() => {
                if (heartbeatCount >= 1) {
                    clearInterval(check)
                    resolve()
                }
            }, 5)
        })

        // Simulate blocking the main Node.js event loop with heavy compute (SHA-256 / AST work)
        const blockStart = Date.now()
        while (Date.now() - blockStart < 160) {
            // Synchronous CPU burn
        }

        // Allow worker thread messages to arrive and queued HTTP requests to process
        await new Promise((r) => setTimeout(r, 60))
        await manager.stop()

        server.close()

        // Detached thread must have fired multiple pulses despite main thread blockage
        expect(heartbeatCount).toBeGreaterThanOrEqual(2)
        expect(ackSpy).toHaveBeenCalled()
        expect(capturedPayload.vramFreeMb).toBe(18420)
        expect(capturedPayload.activeNode).toBe('KSampler')
        expect(capturedPayload.epoch).toBe(7)
    })

    it('TASK-4.1: detects HTTP 409 Conflict from edge and dispatches onZombieFenced', async () => {
        const http = require('node:http')
        const server = http.createServer((req: any, res: any) => {
            res.writeHead(409, { 'Content-Type': 'application/json' })
            res.end(
                JSON.stringify({ error: 'HTTP 409 Conflict: Stale Epoch 3' }),
            )
        })
        await new Promise<void>((resolve) =>
            server.listen(0, '127.0.0.1', () => resolve()),
        )
        const address = server.address() as any
        const port = address.port

        const manager = new TelemetryManager()
        const zombieSpy = vi.fn()

        manager.start(
            {
                heartbeatUrl: `http://127.0.0.1:${port}/leases/heartbeat`,
                taskId: 'task-zombie-fence',
                workerId: 'rig2_gpu',
                epoch: 3,
                intervalMs: 50,
            },
            {
                onZombieFenced: zombieSpy,
            },
        )

        await new Promise((r) => setTimeout(r, 80))
        await manager.stop()
        server.close()

        expect(zombieSpy).toHaveBeenCalledTimes(1)
        expect(zombieSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                status: 409,
                epoch: 3,
                error: 'HTTP 409 Conflict: Stale Epoch 3',
            }),
        )
    })

    it('TASK-4.2: trips Three-Cycle Circuit Breaker when task reaches maxAttempts', async () => {
        const mockMutex = new MockGpuMutex()
        const runner = new MediaBrokerRunner(mockMutex)

        const result = await runner.executeTask(
            {
                taskId: 'task-poison-circuit',
                workerId: 'rig2_gpu',
                epoch: 1,
                heartbeatUrl: 'https://edge.repo-bot/leases/heartbeat',
                stagingDir: path.join(testDir, 'scratch-circuit'),
                attemptCount: 3,
                maxAttempts: 3,
            },
            async () => {
                throw new Error('SHOULD_NOT_EXECUTE')
            },
        )

        expect(result.success).toBe(false)
        expect(result.aborted).toBe(true)
        expect(result.circuitBreakerTripped).toBe(true)
        expect(result.error).toContain('CIRCUIT_BREAKER_TRIPPED')
        expect(mockMutex.isLocked()).toBe(false)
    })

    it('TASK-4.2: executes zombie abort sequence, terminates process (SIGKILL), purges scratch, and releases flock', async () => {
        const mockMutex = new MockGpuMutex()
        const mockChild = new MockChildProcess()

        const scratchDir = path.join(testDir, 'staging-task-zombie')
        fs.mkdirSync(scratchDir, { recursive: true })
        fs.writeFileSync(
            path.join(scratchDir, 'partial_frame.mp4'),
            'intermediate_render_bytes',
        )

        const http = require('node:http')
        const server = http.createServer((req: any, res: any) => {
            res.writeHead(409, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'STALE_EPOCH_ZOMBIE' }))
        })
        await new Promise<void>((resolve) =>
            server.listen(0, '127.0.0.1', () => resolve()),
        )
        const address = server.address() as any
        const port = address.port

        const runner = new MediaBrokerRunner(mockMutex)

        const executionPromise = runner.executeTask(
            {
                taskId: 'task-zombie-run',
                workerId: 'rig2_gpu',
                epoch: 1,
                heartbeatUrl: `http://127.0.0.1:${port}/leases/heartbeat`,
                stagingDir: scratchDir,
                attemptCount: 1,
                maxAttempts: 3,
                heartbeatIntervalMs: 50,
            },
            async (abortSignal) => {
                return new Promise((resolve, reject) => {
                    abortSignal.addEventListener('abort', () => {
                        mockChild.kill('SIGKILL')
                        reject(new Error('ABORTED'))
                    })
                })
            },
        )

        const result = await executionPromise
        server.close()

        expect(result.success).toBe(false)
        expect(result.aborted).toBe(true)
        expect(mockChild.killed).toBe(true)
        expect(fs.existsSync(scratchDir)).toBe(false)
        expect(mockMutex.isLocked()).toBe(false)
    })

    it('TASK-4.2: completes cleanly when no partition occurs and liberates hardware lock', async () => {
        const mockMutex = new MockGpuMutex()
        const scratchDir = path.join(testDir, 'staging-clean')
        fs.mkdirSync(scratchDir, { recursive: true })
        const validOutput = path.join(scratchDir, 'final_plate.mp4')
        fs.writeFileSync(validOutput, 'valid_render_bytes')

        const http = require('node:http')
        const server = http.createServer((req: any, res: any) => {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: true }))
        })
        await new Promise<void>((resolve) =>
            server.listen(0, '127.0.0.1', () => resolve()),
        )
        const address = server.address() as any
        const port = address.port

        const runner = new MediaBrokerRunner(mockMutex)

        const result = await runner.executeTask(
            {
                taskId: 'task-clean-run',
                workerId: 'rig2_gpu',
                epoch: 1,
                heartbeatUrl: `http://127.0.0.1:${port}/leases/heartbeat`,
                stagingDir: scratchDir,
                attemptCount: 1,
                maxAttempts: 3,
                heartbeatIntervalMs: 100,
            },
            async () => {
                return { outputPath: validOutput }
            },
        )

        server.close()

        expect(result.success).toBe(true)
        expect(result.aborted).toBe(false)
        expect(result.outputFilePath).toBe(validOutput)
        expect(mockMutex.isLocked()).toBe(false)
    })
})
