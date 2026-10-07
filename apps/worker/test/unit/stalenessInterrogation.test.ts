import { describe, it, expect, vi } from 'vitest'
import {
    calculateTimeStaleness,
    calculateCompositeHealth,
    NOMINAL_HEARTBEAT_INTERVAL_MS,
    JITTER_TOLERANCE_BUFFER_MS,
    HARD_EVICTION_THRESHOLD_MS,
} from '../../src/fleet/stalenessMath.js'
import { RemoteRunnerInterrogator } from '../../src/fleet/interrogator.js'
import { ShotCoordinatorDO } from '../../src/objects/ShotCoordinatorDO.js'

class MockDurableObjectStorage {
    public store = new Map<string, any>()
    async get(key: string): Promise<any> {
        return this.store.get(key)
    }
    async put(key: string, value: any): Promise<void> {
        this.store.set(key, value)
    }
    async delete(key: string): Promise<void> {
        this.store.delete(key)
    }
    async setAlarm(): Promise<void> {}
    async deleteAlarm(): Promise<void> {}
}

class MockDurableObjectContext {
    public storage = new MockDurableObjectStorage()
    blockConcurrencyWhile(fn: () => Promise<any>): Promise<any> {
        return fn()
    }
    waitUntil(p: Promise<any>): void {
        p.catch(() => {})
    }
}

describe('Remote Interrogation & Staleness Math Battery (Phase 2)', () => {
    it('TASK-2.2: absorbs network jitter within tolerance buffer (delta <= tau + epsilon)', () => {
        const now = 100_000
        const freshHb = now - NOMINAL_HEARTBEAT_INTERVAL_MS // 10s delay
        const jitterHb =
            now - (NOMINAL_HEARTBEAT_INTERVAL_MS + JITTER_TOLERANCE_BUFFER_MS) // 12.5s delay

        const resFresh = calculateTimeStaleness(freshHb, now)
        expect(resFresh.healthScore).toBe(1.0)
        expect(resFresh.rating).toBe('HEALTHY')
        expect(resFresh.isEligible).toBe(true)
        expect(resFresh.effectiveDeltaMs).toBe(0)

        const resJitter = calculateTimeStaleness(jitterHb, now)
        expect(resJitter.healthScore).toBe(1.0)
        expect(resJitter.rating).toBe('HEALTHY')
        expect(resJitter.isEligible).toBe(true)
        expect(resJitter.effectiveDeltaMs).toBe(0)
    })

    it('TASK-2.2: calculates smooth exponential decay past grace window and evicts at 60s', () => {
        const now = 100_000
        // 12.5s grace + 15s half-life = 27.5s total delta
        const halfLifeHb = now - 27_500
        const resHalfLife = calculateTimeStaleness(halfLifeHb, now)

        expect(resHalfLife.healthScore).toBeGreaterThanOrEqual(0.49)
        expect(resHalfLife.healthScore).toBeLessThanOrEqual(0.51)
        expect(resHalfLife.rating).toBe('DEGRADED')
        expect(resHalfLife.isEligible).toBe(true)

        // 12.5s grace + 30s (2 half-lives) = 42.5s total delta
        const twoHalfLivesHb = now - 42_500
        const resTwoHalf = calculateTimeStaleness(twoHalfLivesHb, now)
        expect(resTwoHalf.healthScore).toBeGreaterThanOrEqual(0.24)
        expect(resTwoHalf.healthScore).toBeLessThanOrEqual(0.26)
        expect(resTwoHalf.rating).toBe('STALE')
        expect(resTwoHalf.isEligible).toBe(false)

        // 59,999ms: Just before eviction boundary
        const justBeforeHb = now - 59_999
        const resJustBefore = calculateTimeStaleness(justBeforeHb, now)
        expect(resJustBefore.healthScore).toBeGreaterThan(0.0)

        // 60s threshold: Dead zombie
        const deadHb = now - HARD_EVICTION_THRESHOLD_MS
        const resDead = calculateTimeStaleness(deadHb, now)

        expect(resDead.healthScore).toBe(0.0)
        expect(resDead.rating).toBe('DEAD_ZOMBIE')
        expect(resDead.isEligible).toBe(false)

        // 75,000ms: Deep dead zombie
        const deepDeadHb = now - 75_000
        const resDeepDead = calculateTimeStaleness(deepDeadHb, now)
        expect(resDeepDead.healthScore).toBe(0.0)
        expect(resDeepDead.rating).toBe('DEAD_ZOMBIE')
        expect(resDeepDead.isEligible).toBe(false)
    })

    it('TASK-2.2: penalizes composite score and gates allocation under memory pressure', () => {
        const perfectTime = 1.0
        // 16GB free vs 20GB required -> ratio = 0.8 -> composite = 0.8
        const res = calculateCompositeHealth(perfectTime, 16_000, 20_000)
        expect(res.compositeScore).toBe(0.8)
        expect(res.isEligible).toBe(false) // Fails strictly on required VRAM boundary

        // 24GB free vs 20GB required -> ratio = 1.0 -> composite = 1.0
        const resSufficient = calculateCompositeHealth(
            perfectTime,
            24_000,
            20_000,
        )
        expect(resSufficient.compositeScore).toBe(1.0)
        expect(resSufficient.isEligible).toBe(true)
    })

    it('TASK-2.1: RemoteRunnerInterrogator extracts ComfyUI device VRAM and queue depth', async () => {
        const originalFetch = globalThis.fetch
        globalThis.fetch = vi.fn().mockResolvedValue(
            new Response(
                JSON.stringify({
                    system: {
                        devices: [
                            {
                                name: 'NVIDIA RTX 4090',
                                vram_free: 20 * 1024 * 1024 * 1024,
                                vram_total: 24 * 1024 * 1024 * 1024,
                            },
                        ],
                    },
                    exec_info: { queue_remaining: 2 },
                    active_node: 'KSampler',
                }),
                { status: 200 },
            ),
        ) as any

        const interrogator = new RemoteRunnerInterrogator()
        const report = await interrogator.interrogateRunner(
            'http://rig2.local:8188',
            'rig2_gpu',
            1000,
        )

        globalThis.fetch = originalFetch

        expect(report.reachable).toBe(true)
        expect(report.vramFreeMb).toBe(20480)
        expect(report.vramTotalMb).toBe(24576)
        expect(report.queueDepth).toBe(2)
        expect(report.activeNode).toBe('KSampler')
    })

    it('TASK-2.1: RemoteRunnerInterrogator handles timeouts gracefully without crashing isolate', async () => {
        const originalFetch = globalThis.fetch
        globalThis.fetch = vi
            .fn()
            .mockImplementation(
                () => new Promise((resolve) => setTimeout(resolve, 200)),
            ) as any

        const interrogator = new RemoteRunnerInterrogator()
        const report = await interrogator.interrogateRunner(
            'http://timeout.runner:8188',
            'rig_dead',
            50,
        )

        globalThis.fetch = originalFetch

        expect(report.reachable).toBe(false)
        expect(report.error).toBe('PROBE_TIMEOUT_50MS')
    })

    it('TASK-2.3: ShotCoordinatorDO gates claim when requesting worker is stale (H < 0.50)', async () => {
        const mockCtx = new MockDurableObjectContext()
        const coordinator = new ShotCoordinatorDO(mockCtx as any, {})

        // Enqueue task
        await coordinator.fetch(
            new Request('https://do.internal/enqueue', {
                method: 'POST',
                body: JSON.stringify({
                    taskId: 'shot-staleness-gate',
                    artistId: 'artist_1',
                }),
            }),
        )

        // Seed worker heartbeat as 40s stale (half-life exceeded, H < 0.50)
        ;(coordinator as any).workerHeartbeats.set(
            'rig2_stale',
            Date.now() - 40_000,
        )

        const claimRes = await coordinator.fetch(
            new Request('https://do.internal/leases/claim', {
                method: 'POST',
                body: JSON.stringify({ workerId: 'rig2_stale' }),
            }),
        )

        expect(claimRes.status).toBe(409)
        const err = (await claimRes.json()) as any
        expect(err.error).toBe('WORKER_STALE_GATED')
        expect(err.rating).toBe('STALE')
        expect((coordinator as any).activeJob).toBeNull()
        expect((coordinator as any).fairQueue.size()).toBe(1)
    })

    it('TASK-2.3: ShotCoordinatorDO reports fleet instantaneous staleness via /fleet/health', async () => {
        const mockCtx = new MockDurableObjectContext()
        const coordinator = new ShotCoordinatorDO(mockCtx as any, {})
        const now = Date.now()

        ;(coordinator as any).workerHeartbeats.set('worker_fresh', now - 5_000)
        ;(coordinator as any).workerHeartbeats.set('worker_stale', now - 40_000)

        const healthRes = await coordinator.fetch(
            new Request('https://do.internal/fleet/health', {
                method: 'GET',
            }),
        )

        expect(healthRes.status).toBe(200)
        const data = (await healthRes.json()) as any
        expect(data.ok).toBe(true)
        expect(data.fleet.worker_fresh.rating).toBe('HEALTHY')
        expect(data.fleet.worker_fresh.isEligible).toBe(true)
        expect(data.fleet.worker_stale.rating).toBe('STALE')
        expect(data.fleet.worker_stale.isEligible).toBe(false)
    })
})
