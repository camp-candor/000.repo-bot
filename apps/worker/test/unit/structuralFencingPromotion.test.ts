import { describe, it, expect, beforeEach } from 'vitest'
import { ShotCoordinatorDO } from '../../src/objects/ShotCoordinatorDO.js'
import {
    parseStagingKey,
    validateStagingKey,
    buildCanonicalKey,
} from '../../src/storage/r2Promotion.js'

class MockDurableObjectStorage {
    public store = new Map<string, any>()
    public activeAlarm: number | null = null

    async get(key: string): Promise<any> {
        return this.store.get(key)
    }

    async put(key: string, value: any): Promise<void> {
        this.store.set(key, value)
    }

    async delete(key: string): Promise<void> {
        this.store.delete(key)
    }

    async setAlarm(timeMs: number): Promise<void> {
        this.activeAlarm = timeMs
    }

    async deleteAlarm(): Promise<void> {
        this.activeAlarm = null
    }
}

class MockDurableObjectContext {
    public storage = new MockDurableObjectStorage()

    blockConcurrencyWhile(fn: () => Promise<any>): Promise<any> {
        return fn()
    }
}

describe('Structural Fencing & Content-Addressed Promotion Battery (Phase 3)', () => {
    let mockCtx: MockDurableObjectContext
    let coordinator: ShotCoordinatorDO

    beforeEach(() => {
        mockCtx = new MockDurableObjectContext()
        coordinator = new ShotCoordinatorDO(mockCtx as any, {})
    })

    it('TASK-3.1: parses and validates content-addressed epoch-scoped staging keys', () => {
        const validKey =
            'staging/renders/shot-101/epoch_3_a8f5b3c2e1d0f4a8b7c9e0d1f2a3b4c5.mp4'
        const parsed = parseStagingKey(validKey)

        expect(parsed.taskId).toBe('shot-101')
        expect(parsed.epoch).toBe(3)
        expect(parsed.sha256).toBe('a8f5b3c2e1d0f4a8b7c9e0d1f2a3b4c5')
        expect(parsed.extension).toBe('mp4')

        // Validates expected taskId and active lease epoch
        expect(() => validateStagingKey(validKey, 'shot-101', 3)).not.toThrow()

        // Rejects mismatched task ID or lease epoch
        expect(() => validateStagingKey(validKey, 'other-shot', 3)).toThrow(
            /TASK_ID_MISMATCH/,
        )
        expect(() => validateStagingKey(validKey, 'shot-101', 4)).toThrow(
            /EPOCH_TOKEN_MISMATCH/,
        )

        // Rejects malformed staging paths
        expect(() => parseStagingKey('renders/shot-101/final.mp4')).toThrow(
            /INVALID_STAGING_KEY/,
        )
        expect(() =>
            parseStagingKey('staging/renders/shot-101/epoch_invalid_hash.mp4'),
        ).toThrow(/INVALID_STAGING_KEY/)
    })

    it('TASK-3.1: builds canonical object storage path correctly', () => {
        const canonical = buildCanonicalKey(
            'shot-101',
            'a8f5b3c2e1d0f4a8b7c9e0d1f2a3b4c5',
            'mp4',
        )
        expect(canonical).toBe(
            'canonical/renders/shot-101/a8f5b3c2e1d0f4a8b7c9e0d1f2a3b4c5.mp4',
        )
    })

    it('TASK-3.2: structurally fences zombie worker with HTTP 409 Conflict when presented epoch is stale', async () => {
        await coordinator.fetch(
            new Request('https://do.internal/enqueue', {
                method: 'POST',
                body: JSON.stringify({
                    taskId: 'shot-zombie-01',
                    artistId: 'artist1',
                    idempotencyKey: 'idemp1',
                }),
            }),
        )

        // Claim lease under Epoch 1
        await coordinator.fetch(
            new Request('https://do.internal/leases/claim', {
                method: 'POST',
                body: JSON.stringify({ workerId: 'rig2_gpu' }),
            }),
        )

        // Simulate network partition: Watchdog alarm fires, revoking lease and bumping epoch to 2
        await coordinator.alarm()

        const stateRes = await coordinator.fetch(
            new Request('https://do.internal/state'),
        )
        const stateData = (await stateRes.json()) as any
        expect(stateData.currentEpoch).toBe(2)

        // Partitioned worker wakes up and attempts promotion using stale Epoch 1
        const zombieStagingKey =
            'staging/renders/shot-zombie-01/epoch_1_9f83a2c4e1b0d5a7b8c6e4d2f1a3b5c7.mp4'
        const promoRes = await coordinator.fetch(
            new Request('https://do.internal/tasks/complete', {
                method: 'POST',
                body: JSON.stringify({
                    taskId: 'shot-zombie-01',
                    workerId: 'rig2_gpu',
                    epoch: 1,
                    stagingKey: zombieStagingKey,
                    sha256: '9f83a2c4e1b0d5a7b8c6e4d2f1a3b5c7',
                }),
            }),
        )

        expect(promoRes.status).toBe(409)
        const promoData = (await promoRes.json()) as any
        expect(promoData.fenced).toBe(true)
        expect(promoData.error).toContain('HTTP 409 Conflict: Stale Epoch 1')

        // Assert canonical manifest was not mutated in storage
        const snapshot = mockCtx.storage.store.get('canonical_manifests')
        expect(snapshot?.['shot-zombie-01']).toBeUndefined()
    })

    it('TASK-3.2: atomically promotes artifact into canonical manifest when epoch matches', async () => {
        await coordinator.fetch(
            new Request('https://do.internal/enqueue', {
                method: 'POST',
                body: JSON.stringify({
                    taskId: 'shot-clean-01',
                    artistId: 'artist1',
                    idempotencyKey: 'idemp2',
                }),
            }),
        )

        // Claim lease under Epoch 1
        await coordinator.fetch(
            new Request('https://do.internal/leases/claim', {
                method: 'POST',
                body: JSON.stringify({ workerId: 'rig2_gpu' }),
            }),
        )

        expect(mockCtx.storage.activeAlarm).not.toBeNull()

        // Legitimate worker completes task under active Epoch 1
        const validStagingKey =
            'staging/renders/shot-clean-01/epoch_1_5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8.mp4'
        const promoRes = await coordinator.fetch(
            new Request('https://do.internal/tasks/complete', {
                method: 'POST',
                body: JSON.stringify({
                    taskId: 'shot-clean-01',
                    workerId: 'rig2_gpu',
                    epoch: 1,
                    stagingKey: validStagingKey,
                    sha256: '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8',
                }),
            }),
        )

        expect(promoRes.status).toBe(200)
        const promoData = (await promoRes.json()) as any
        expect(promoData.promoted).toBe(true)
        expect(promoData.canonicalKey).toBe(
            'canonical/renders/shot-clean-01/5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8.mp4',
        )

        // Verify storage state and disarmed alarm
        const snapshot = mockCtx.storage.store.get('canonical_manifests')
        expect(snapshot['shot-clean-01']).toBeDefined()
        expect(snapshot['shot-clean-01'].canonicalKey).toBe(
            promoData.canonicalKey,
        )
        expect(mockCtx.storage.activeAlarm).toBeNull()
    })

    it('TASK-3.2: idempotent RPC safely accepts duplicate completion requests caused by network blips', async () => {
        await coordinator.fetch(
            new Request('https://do.internal/enqueue', {
                method: 'POST',
                body: JSON.stringify({
                    taskId: 'shot-idempotent-01',
                    artistId: 'artist1',
                    idempotencyKey: 'idemp3',
                }),
            }),
        )

        await coordinator.fetch(
            new Request('https://do.internal/leases/claim', {
                method: 'POST',
                body: JSON.stringify({ workerId: 'rig2_gpu' }),
            }),
        )

        const stagingKey =
            'staging/renders/shot-idempotent-01/epoch_1_5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8.mp4'
        const payload = {
            taskId: 'shot-idempotent-01',
            workerId: 'rig2_gpu',
            epoch: 1,
            stagingKey,
            sha256: '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8',
        }

        const firstRes = await coordinator.fetch(
            new Request('https://do.internal/tasks/complete', {
                method: 'POST',
                body: JSON.stringify(payload),
            }),
        )
        expect(firstRes.status).toBe(200)

        // Network retransmission arrives
        const retryRes = await coordinator.fetch(
            new Request('https://do.internal/tasks/complete', {
                method: 'POST',
                body: JSON.stringify(payload),
            }),
        )

        expect(retryRes.status).toBe(200)
        const retryData = (await retryRes.json()) as any
        expect(retryData.alreadyPromoted).toBe(true)
        expect(retryData.canonicalKey).toBe(
            'canonical/renders/shot-idempotent-01/5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8.mp4',
        )
    })

    it('TASK-3.1 & 3.2: rejects malformed staging keys with HTTP 400 Bad Request', async () => {
        await coordinator.fetch(
            new Request('https://do.internal/enqueue', {
                method: 'POST',
                body: JSON.stringify({
                    taskId: 'shot-bad-01',
                    artistId: 'artist1',
                    idempotencyKey: 'idemp4',
                }),
            }),
        )

        await coordinator.fetch(
            new Request('https://do.internal/leases/claim', {
                method: 'POST',
                body: JSON.stringify({ workerId: 'rig2_gpu' }),
            }),
        )

        const badKeyRes = await coordinator.fetch(
            new Request('https://do.internal/tasks/complete', {
                method: 'POST',
                body: JSON.stringify({
                    taskId: 'shot-bad-01',
                    workerId: 'rig2_gpu',
                    epoch: 1,
                    stagingKey: 'unscoped/direct_write.mp4',
                    sha256: '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8',
                }),
            }),
        )

        expect(badKeyRes.status).toBe(400)
        const badData = (await badKeyRes.json()) as any
        expect(badData.error).toContain('INVALID_STAGING_KEY')
    })
})
