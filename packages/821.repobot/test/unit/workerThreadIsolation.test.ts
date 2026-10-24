import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { EventEmitter } from 'node:events'
import { type ChildProcess } from 'node:child_process'
import http from 'node:http'
import { HeartbeatManager } from '../../src/telemetry/heartbeatManager.js'
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
    public pid = 12345

    kill(signal = 'SIGTERM'): boolean {
        this.killed = true
        this.emit('close', 0, signal)
        return true
    }
}

describe('Rig 2 Worker Thread Isolation & Zombie Abort Battery (Phase 4)', () => {
    const testDir = path.resolve(__dirname, '../../tmp/test-scratch')

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

        // Spin up a local HTTP server to act as the edge DO for the detached worker
        const server = http.createServer((req, res) => {
            if (req.method === 'POST' && req.url === '/leases/heartbeat') {
                heartbeatCount++
                res.writeHead(200, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ ok: true }))
            } else {
                res.writeHead(404)
                res.end()
            }
        })

        await new Promise<void>((resolve) => server.listen(0, resolve))
        const port = (server.address() as any).port
        const heartbeatUrl = `http://127.0.0.1:${port}/leases/heartbeat`

        const manager = new HeartbeatManager()
        const ackSpy = vi.fn()

        manager.start(
            {
                heartbeatUrl,
                taskId: 'task-heavy-cpu',
                workerId: 'rig2_gpu',
                epoch: 1,
                intervalMs: 50, // Accelerated for test
            },
            {
                onPulseAck: ackSpy,
                onZombieFenced: vi.fn(),
            },
        )

        // Simulate blocking the main Node.js event loop with heavy compute (e.g. SHA-256 / AST work)
        const blockStart = Date.now()
        while (Date.now() - blockStart < 160) {
            // Synchronous CPU burn blocking main event loop
        }

        // Allow worker messages to resolve
        await new Promise((r) => setTimeout(r, 60))
        await manager.stop()

        server.close()

        // The detached worker thread must have fired multiple pulses despite the main thread being blocked
        expect(heartbeatCount).toBeGreaterThanOrEqual(2)
        expect(ackSpy).toHaveBeenCalled()
    })

    it('TASK-4.1: detects HTTP 409 Conflict from edge and fires onZombieFenced', async () => {
        const server = http.createServer((req, res) => {
            res.writeHead(409, { 'Content-Type': 'application/json' })
            res.end(
                JSON.stringify({ error: 'HTTP 409 Conflict: Stale Epoch 1' }),
            )
        })

        await new Promise<void>((resolve) => server.listen(0, resolve))
        const port = (server.address() as any).port
        const heartbeatUrl = `http://127.0.0.1:${port}/leases/heartbeat`

        const manager = new HeartbeatManager()
        const zombieSpy = vi.fn()

        manager.start(
            {
                heartbeatUrl,
                taskId: 'task-zombie-detect',
                workerId: 'rig2_gpu',
                epoch: 1,
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
                epoch: 1,
                error: 'HTTP 409 Conflict: Stale Epoch 1',
            }),
        )
    })

    it('TASK-4.2: executes zombie abort sequence, terminates process, purges scratch, and releases flock', async () => {
        const mockMutex = new MockGpuMutex()
        const mockChild = new MockChildProcess()

        const scratchDir = path.join(testDir, 'staging-task-zombie')
        fs.mkdirSync(scratchDir, { recursive: true })
        fs.writeFileSync(
            path.join(scratchDir, 'partial.mp4'),
            'transient_bytes',
        )

        // Heartbeat endpoint returning 409 Conflict
        const server = http.createServer((req, res) => {
            res.writeHead(409, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'STALE_EPOCH_ZOMBIE' }))
        })
        await new Promise<void>((resolve) => server.listen(0, resolve))
        const port = (server.address() as any).port
        const heartbeatUrl = `http://127.0.0.1:${port}/leases/heartbeat`

        const runner = new MediaBrokerRunner(mockMutex)

        const executionPromise = runner.executeTask(
            {
                taskId: 'task-zombie-run',
                workerId: 'rig2_gpu',
                epoch: 1,
                heartbeatUrl,
                stagingDir: scratchDir,
                heartbeatIntervalMs: 50,
            },
            async (abortSignal) => {
                // Simulate a process that runs until aborted
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

        // Verify that execution was cleanly aborted
        expect(result.success).toBe(false)
        expect(result.aborted).toBe(true)

        // Verify child process was forcefully killed
        expect(mockChild.killed).toBe(true)

        // Verify staging directory was wiped clean
        expect(fs.existsSync(scratchDir)).toBe(false)

        // Verify hardware mutex was released
        expect(mockMutex.isLocked()).toBe(false)
    })

    it('TASK-4.2: completes cleanly when no partition occurs and liberates hardware lock', async () => {
        const mockMutex = new MockGpuMutex()
        const scratchDir = path.join(testDir, 'staging-clean')
        fs.mkdirSync(scratchDir, { recursive: true })
        const validOutput = path.join(scratchDir, 'clean_plate.mp4')
        fs.writeFileSync(validOutput, 'valid_render_bytes')

        const server = http.createServer((req, res) => {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: true }))
        })
        await new Promise<void>((resolve) => server.listen(0, resolve))
        const port = (server.address() as any).port
        const heartbeatUrl = `http://127.0.0.1:${port}/leases/heartbeat`

        const runner = new MediaBrokerRunner(mockMutex)

        const result = await runner.executeTask(
            {
                taskId: 'task-clean-run',
                workerId: 'rig2_gpu',
                epoch: 1,
                heartbeatUrl,
                stagingDir: scratchDir,
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

    it('TASK-4.3: guarantees clean worker teardown and stop lifecycle without dangling handles', async () => {
        const server = http.createServer((req, res) => {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: true }))
        })
        await new Promise<void>((resolve) => server.listen(0, resolve))
        const port = (server.address() as any).port
        const heartbeatUrl = `http://127.0.0.1:${port}/leases/heartbeat`

        const manager = new HeartbeatManager()
        let pulseReceived = false

        manager.start(
            {
                heartbeatUrl,
                taskId: 'task-clean-teardown',
                workerId: 'rig2_gpu',
                epoch: 1,
                intervalMs: 50,
            },
            {
                onPulseAck: () => {
                    pulseReceived = true
                },
                onZombieFenced: vi.fn(),
            },
        )

        // Wait for at least one clean pulse
        const startTime = Date.now()
        while (!pulseReceived && Date.now() - startTime < 1000) {
            await new Promise((r) => setTimeout(r, 20))
        }

        expect(pulseReceived).toBe(true)
        expect(manager.isActive()).toBe(true)

        const stopStart = Date.now()
        await manager.stop()
        const stopDuration = Date.now() - stopStart

        server.close()

        expect(stopDuration).toBeLessThan(1000)
        expect(manager.isActive()).toBe(false)
    })
})
