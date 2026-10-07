import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import {
    computeStreamSha256,
    verifyR2ObjectChecksum,
} from '../../src/archive/bitRotDetector.js'
import {
    RollingR2Scrubber,
    type R2BucketInterface,
    type R2ObjectBodyInterface,
    type R2ObjectInterface,
} from '../../src/archive/r2Scrubber.js'
import { ShotCoordinatorDO } from '../../src/objects/ShotCoordinatorDO.js'

function createMockReadableStream(
    chunks: string[],
): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder()
    let index = 0
    return new ReadableStream<Uint8Array>({
        pull(controller) {
            if (index < chunks.length) {
                controller.enqueue(encoder.encode(chunks[index]))
                index += 1
            } else {
                controller.close()
            }
        },
    })
}

class MockR2Bucket implements R2BucketInterface {
    public storage = new Map<
        string,
        { content: string; metadata?: Record<string, string> }
    >()
    public deletedKeys: string[] = []

    async list(options?: { prefix?: string; cursor?: string; limit?: number }) {
        const prefix = options?.prefix || ''
        const limit = options?.limit || 50
        const allKeys = Array.from(this.storage.keys()).filter((k) =>
            k.startsWith(prefix),
        )

        let startIndex = 0
        if (options?.cursor) {
            const foundIndex = allKeys.indexOf(options.cursor)
            if (foundIndex >= 0) startIndex = foundIndex
        }

        const slice = allKeys.slice(startIndex, startIndex + limit)
        const truncated = startIndex + limit < allKeys.length
        const nextCursor = truncated ? allKeys[startIndex + limit] : undefined

        const objects: R2ObjectInterface[] = slice.map((key) => {
            const item = this.storage.get(key)!
            return {
                key,
                size: item.content.length,
                customMetadata: item.metadata,
                uploaded: new Date(),
            }
        })

        return { objects, truncated, cursor: nextCursor }
    }

    async get(key: string): Promise<R2ObjectBodyInterface | null> {
        const item = this.storage.get(key)
        if (!item) return null

        const body = createMockReadableStream([item.content])
        return {
            key,
            size: item.content.length,
            customMetadata: item.metadata,
            uploaded: new Date(),
            body,
            async arrayBuffer() {
                return new TextEncoder().encode(item.content).buffer
            },
        }
    }

    async put(
        key: string,
        value: any,
        options?: any,
    ): Promise<R2ObjectInterface> {
        let content = ''
        if (typeof value === 'string') content = value
        else if (value instanceof ArrayBuffer)
            content = new TextDecoder().decode(value)

        this.storage.set(key, { content, metadata: options?.customMetadata })
        return {
            key,
            size: content.length,
            customMetadata: options?.customMetadata,
            uploaded: new Date(),
        }
    }

    async delete(key: string): Promise<void> {
        this.storage.delete(key)
        this.deletedKeys.push(key)
    }
}

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
}

class MockDurableObjectContext {
    public storage = new MockDurableObjectStorage()
    blockConcurrencyWhile(fn: () => Promise<any>): Promise<any> {
        return fn()
    }
    waitUntil(promise: Promise<any>): void {
        promise.catch(() => {})
    }
}

describe('Rolling R2 Archive Scrub & Bit-Rot Defense Battery (Phase 2)', () => {
    it('TASK-2.1: computeStreamSha256 computes accurate hashes incrementally over streams', async () => {
        const stream = createMockReadableStream([
            'video_header_',
            'frame_001_',
            'frame_002',
        ])
        const { sha256, totalBytes } = await computeStreamSha256(stream)

        const expected = createHash('sha256')
            .update('video_header_frame_001_frame_002')
            .digest('hex')
        expect(sha256).toBe(expected)
        expect(totalBytes).toBe('video_header_frame_001_frame_002'.length)
    })

    it('TASK-2.1: verifyR2ObjectChecksum detects bit-rot when payload diverges from metadata', async () => {
        const goodStream = createMockReadableStream(['clean_render_bytes'])
        const validHash = createHash('sha256')
            .update('clean_render_bytes')
            .digest('hex')

        const cleanRes = await verifyR2ObjectChecksum(
            'canonical/renders/shot1.mp4',
            goodStream,
            validHash,
        )
        expect(cleanRes.status).toBe('HEALTHY')
        expect(cleanRes.computedSha256).toBe(validHash)

        // Bit-rot payload: byte flipped
        const rotStream = createMockReadableStream(['corrupted_render_bytes'])
        const rotRes = await verifyR2ObjectChecksum(
            'canonical/renders/shot1.mp4',
            rotStream,
            validHash,
        )
        expect(rotRes.status).toBe('BIT_ROT_DETECTED')
        expect(rotRes.error).toContain('BIT_ROT_CHECKSUM_MISMATCH')
    })

    it('TASK-2.2: RollingR2Scrubber sweeps canonical assets, preserves healthy, and quarantines rot', async () => {
        const bucket = new MockR2Bucket()
        const scrubber = new RollingR2Scrubber(bucket)

        const healthyContent = 'perfect_render_bytes'
        const healthySha = createHash('sha256')
            .update(healthyContent)
            .digest('hex')

        const rottenContent = 'bit_flipped_render_bytes'
        const recordedExpectedSha =
            'deadbeef0000111122223333444455556666777788889999aaaabbbbccccdddd'

        await bucket.put('canonical/renders/shot-clean.mp4', healthyContent, {
            customMetadata: { sha256: healthySha },
        })

        await bucket.put('canonical/renders/shot-rotten.mp4', rottenContent, {
            customMetadata: { sha256: recordedExpectedSha },
        })

        const report = await scrubber.scrubBatch({
            prefix: 'canonical/renders/',
            batchLimit: 10,
        })

        expect(report.totalScanned).toBe(2)
        expect(report.healthyCount).toBe(1)
        expect(report.corruptedCount).toBe(1)
        expect(report.quarantinedKeys).toContain(
            'canonical/renders/shot-rotten.mp4',
        )

        // Confirm corrupted asset was removed from canonical namespace and moved to quarantine
        expect(bucket.storage.has('canonical/renders/shot-clean.mp4')).toBe(
            true,
        )
        expect(bucket.storage.has('canonical/renders/shot-rotten.mp4')).toBe(
            false,
        )

        const quarantinedItem = Array.from(bucket.storage.entries()).find(
            ([k]) => k.startsWith('quarantine/bit_rot/'),
        )
        expect(quarantinedItem).toBeDefined()
        expect(quarantinedItem![1].content).toBe(rottenContent)
        expect(quarantinedItem![1].metadata?.expected_sha256).toBe(
            recordedExpectedSha,
        )
    })

    it('TASK-2.2: RollingR2Scrubber supports cursor pagination across batches', async () => {
        const bucket = new MockR2Bucket()
        const scrubber = new RollingR2Scrubber(bucket)

        for (let i = 0; i < 5; i++) {
            const content = `data_${i}`
            const sha = createHash('sha256').update(content).digest('hex')
            await bucket.put(`canonical/renders/shot_${i}.mp4`, content, {
                customMetadata: { sha256: sha },
            })
        }

        // First batch of 3
        const batch1 = await scrubber.scrubBatch({
            prefix: 'canonical/renders/',
            batchLimit: 3,
        })

        expect(batch1.totalScanned).toBe(3)
        expect(batch1.isTruncated).toBe(true)
        expect(batch1.nextCursor).toBeDefined()

        // Second batch using continuation cursor
        const batch2 = await scrubber.scrubBatch({
            prefix: 'canonical/renders/',
            cursor: batch1.nextCursor,
            batchLimit: 3,
        })

        expect(batch2.totalScanned).toBe(2)
        expect(batch2.isTruncated).toBe(false)
    })

    it('TASK-2.3: ShotCoordinatorDO runs scrub endpoint and commits BIT_ROT_QUARANTINED ledger block', async () => {
        const mockCtx = new MockDurableObjectContext()
        const bucket = new MockR2Bucket()

        const coordinator = new ShotCoordinatorDO(mockCtx as any, {
            STORAGE: bucket,
            CHATOPS_WEBHOOK_URL: 'https://chatops.internal/webhook',
        })

        ;(coordinator as any).ledgerChain = [
            {
                index: 0,
                blockHash: '0'.repeat(64),
                eventType: 'GENESIS',
                payload: {},
                timestampMs: Date.now(),
            },
        ]

        // Insert corrupted asset
        await bucket.put('canonical/renders/shot-fail.mp4', 'corrupt_stream', {
            customMetadata: { sha256: 'expected_hash_unmatched' },
        })

        const res = await coordinator.fetch(
            new Request('https://do.internal/archive/scrub', {
                method: 'POST',
                body: JSON.stringify({ batchLimit: 10 }),
            }),
        )

        expect(res.status).toBe(200)
        const data = (await res.json()) as any
        expect(data.ok).toBe(true)
        expect(data.report.corruptedCount).toBe(1)

        // Verify cryptographic hash chain has recorded the quarantine event
        const ledgerChain = (coordinator as any).ledgerChain
        const lastBlock = ledgerChain[ledgerChain.length - 1]
        expect(lastBlock.eventType).toBe('BIT_ROT_QUARANTINED')
        expect(lastBlock.payload.quarantinedKeys).toContain(
            'canonical/renders/shot-fail.mp4',
        )

        // Check inspection status route
        const statusRes = await coordinator.fetch(
            new Request('https://do.internal/archive/scrub/status'),
        )
        const statusData = (await statusRes.json()) as any
        expect(statusData.totalCorruptedDetected).toBe(1)
    })
})
