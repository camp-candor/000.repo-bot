import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { GpuHardwareMutex } from '../../src/hardware/gpuLock.js'
import { LocalPullBroker } from '../../src/queue/pullBroker.js'

describe('Inverted Hardware Mutex & Local flock Sovereignty Suite (Phase 1)', () => {
    const testDir = path.resolve(__dirname, '../../tmp/test-gpu-lock')
    const lockFilePath = path.join(testDir, 'rig2_gpu.lock')

    beforeEach(() => {
        if (!fs.existsSync(testDir)) {
            fs.mkdirSync(testDir, { recursive: true })
        }
    })

    afterEach(() => {
        if (fs.existsSync(lockFilePath)) {
            try {
                fs.unlinkSync(lockFilePath)
            } catch {}
        }
        if (fs.existsSync(testDir)) {
            try {
                fs.rmSync(testDir, { recursive: true, force: true })
            } catch {}
        }
    })

    it('TASK-1.1: acquires exclusive lock when idle and denies secondary acquisition with EWOULDBLOCK semantics', () => {
        const mutexA = new GpuHardwareMutex({ lockFilePath })
        const mutexB = new GpuHardwareMutex({ lockFilePath })

        // First instance acquires lock successfully
        expect(mutexA.acquireLock()).toBe(true)
        expect(mutexA.isLocked()).toBe(true)

        // Secondary instance attempts acquisition and fails non-blockingly
        expect(mutexB.acquireLock()).toBe(false)
        expect(mutexB.isLocked()).toBe(false)

        // Releasing mutexA permits mutexB to acquire the hardware
        mutexA.releaseLock()
        expect(mutexA.isLocked()).toBe(false)

        expect(mutexB.acquireLock()).toBe(true)
        expect(mutexB.isLocked()).toBe(true)
        mutexB.releaseLock()
    })

    it('TASK-1.1: supports custom POSIX flock bindings and handles EAGAIN/EWOULDBLOCK', () => {
        let kernelLocked = false

        const mockFlockBinding = {
            lock: vi.fn((_fd: number) => {
                if (kernelLocked) return false
                kernelLocked = true
                return true
            }),
            unlock: vi.fn((_fd: number) => {
                kernelLocked = false
            }),
        }

        const mutex = new GpuHardwareMutex({
            lockFilePath,
            flockBinding: mockFlockBinding,
        })

        expect(mutex.acquireLock()).toBe(true)
        expect(mockFlockBinding.lock).toHaveBeenCalledTimes(1)

        // Second acquisition fails because kernel lock is engaged
        const concurrentMutex = new GpuHardwareMutex({
            lockFilePath,
            flockBinding: mockFlockBinding,
        })
        expect(concurrentMutex.acquireLock()).toBe(false)

        mutex.releaseLock()
        expect(mockFlockBinding.unlock).toHaveBeenCalledTimes(1)
    })

    it('TASK-1.2: LocalPullBroker aborts edge pull when hardware is actively occupied locally (eliminates Two-Queue collision)', async () => {
        const mockFetch = vi.fn()
        const originalFetch = globalThis.fetch
        globalThis.fetch = mockFetch

        const occupyingMutex = new GpuHardwareMutex({ lockFilePath })
        expect(occupyingMutex.acquireLock()).toBe(true)

        const brokerMutex = new GpuHardwareMutex({ lockFilePath })
        const broker = new LocalPullBroker(brokerMutex, 'rig2_gpu')

        const executorSpy = vi.fn()
        const result = await broker.pollAndExecuteOnce(
            'https://edge.repo-bot',
            executorSpy,
        )

        // Assert that the edge DO was never queried, preventing dual-claimant allocation
        expect(result.status).toBe('BUSY_LOCAL_LOCK')
        expect(mockFetch).not.toHaveBeenCalled()
        expect(executorSpy).not.toHaveBeenCalled()

        occupyingMutex.releaseLock()
        globalThis.fetch = originalFetch
    })

    it('TASK-1.2: LocalPullBroker acquires lock, claims task from edge, executes, and releases lock on completion', async () => {
        const originalFetch = globalThis.fetch
        globalThis.fetch = vi.fn().mockResolvedValue({
            status: 200,
            json: async () => ({
                ok: true,
                taskId: 'TASK-PULL-001',
                epoch: 1,
                workflowTemplate: 'wan_greenscreen.json',
            }),
        }) as any

        const mutex = new GpuHardwareMutex({ lockFilePath })
        const broker = new LocalPullBroker(mutex, 'rig2_gpu')

        const executorSpy = vi.fn().mockImplementation(async () => {
            // Verify lock is physically held during execution
            expect(mutex.isLocked()).toBe(true)
            return { success: true, outputPath: '/mnt/nvme-scratch/out.mp4' }
        })

        const result = await broker.pollAndExecuteOnce(
            'https://edge.repo-bot',
            executorSpy,
        )

        expect(result.status).toBe('JOB_COMPLETED')
        expect(result.taskId).toBe('TASK-PULL-001')
        expect(executorSpy).toHaveBeenCalledTimes(1)

        // Lock must be surrendered upon completion
        expect(mutex.isLocked()).toBe(false)
        globalThis.fetch = originalFetch
    })

    it('TASK-1.2: releases hardware lock unconditionally if execution throws', async () => {
        const originalFetch = globalThis.fetch
        globalThis.fetch = vi.fn().mockResolvedValue({
            status: 200,
            json: async () => ({
                ok: true,
                taskId: 'TASK-FAIL-001',
                epoch: 1,
            }),
        }) as any

        const mutex = new GpuHardwareMutex({ lockFilePath })
        const broker = new LocalPullBroker(mutex, 'rig2_gpu')

        const crashingExecutor = vi
            .fn()
            .mockRejectedValue(new Error('CUDA_KERNEL_PANIC'))

        const result = await broker.pollAndExecuteOnce(
            'https://edge.repo-bot',
            crashingExecutor,
        )

        expect(result.status).toBe('JOB_FAILED')
        expect(result.error).toBe('CUDA_KERNEL_PANIC')

        // Mutex must not remain deadlocked
        expect(mutex.isLocked()).toBe(false)
        globalThis.fetch = originalFetch
    })

    it('TASK-1.2: handles empty edge queue (HTTP 204 or no jobs) and liberates lock immediately', async () => {
        const originalFetch = globalThis.fetch
        // Case 1: HTTP 204 No Content
        globalThis.fetch = vi.fn().mockResolvedValue({
            status: 204,
        }) as any

        const mutex = new GpuHardwareMutex({ lockFilePath })
        const broker = new LocalPullBroker(mutex, 'rig2_gpu')
        const executorSpy = vi.fn()

        const result204 = await broker.pollAndExecuteOnce(
            'https://edge.repo-bot',
            executorSpy,
        )

        expect(result204.status).toBe('QUEUE_EMPTY')
        expect(executorSpy).not.toHaveBeenCalled()
        expect(mutex.isLocked()).toBe(false)

        // Case 2: Response with no jobs
        globalThis.fetch = vi.fn().mockResolvedValue({
            status: 200,
            json: async () => ({
                ok: true,
                noJobs: true,
            }),
        }) as any

        const resultNoJobs = await broker.pollAndExecuteOnce(
            'https://edge.repo-bot',
            executorSpy,
        )

        expect(resultNoJobs.status).toBe('QUEUE_EMPTY')
        expect(executorSpy).not.toHaveBeenCalled()
        expect(mutex.isLocked()).toBe(false)

        globalThis.fetch = originalFetch
    })
})
