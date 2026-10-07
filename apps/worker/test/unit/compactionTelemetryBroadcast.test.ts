import { describe, it, expect, vi } from 'vitest'
import {
    createGenesisBlock,
    appendLedgerEntry,
    type LedgerEntry,
} from '../../src/ledger/cryptoLedger.js'
import {
    computeMerkleRoot,
    compactLedger,
    verifyCompactedLedger,
} from '../../src/ledger/ledgerCompactor.js'
import {
    TelemetryBroadcaster,
    formatCompactionBroadcast,
    formatGenericTelemetryFrame,
} from '../../src/telemetry/telemetryBroadcaster.js'
import { ShotCoordinatorDO } from '../../src/objects/ShotCoordinatorDO.js'

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
    async setAlarm(ms: number): Promise<void> {
        this.activeAlarm = ms
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
    waitUntil(promise: Promise<any>): void {
        promise.catch(() => {})
    }
}

describe('Compaction & Telemetry Broadcast Adversarial Battery (Phase 3)', () => {
    // -------------------------------------------------------------------------
    // 1. Deterministic Merkle Accumulation Precision
    // -------------------------------------------------------------------------
    it('INVARIANT-1: Deterministic Merkle Accumulation Precision', async () => {
        const evenHashes = [
            '1111111111111111111111111111111111111111111111111111111111111111',
            '2222222222222222222222222222222222222222222222222222222222222222',
            '3333333333333333333333333333333333333333333333333333333333333333',
            '4444444444444444444444444444444444444444444444444444444444444444',
        ]
        const oddHashes = evenHashes.slice(0, 3)

        // Determinism check for even and odd lengths
        const rootEven1 = await computeMerkleRoot(evenHashes)
        const rootEven2 = await computeMerkleRoot(evenHashes)
        expect(rootEven1).toBe(rootEven2)
        expect(rootEven1).toMatch(/^[a-f0-9]{64}$/)

        const rootOdd1 = await computeMerkleRoot(oddHashes)
        const rootOdd2 = await computeMerkleRoot(oddHashes)
        expect(rootOdd1).toBe(rootOdd2)
        expect(rootOdd1).toMatch(/^[a-f0-9]{64}$/)

        // Avalanche effect: alter 1 bit (change final character '4' to '5')
        const perturbedHashes = [
            evenHashes[0],
            evenHashes[1],
            evenHashes[2],
            '4444444444444444444444444444444444444444444444444444444444444445',
        ]
        const perturbedRoot = await computeMerkleRoot(perturbedHashes)
        expect(perturbedRoot).not.toBe(rootEven1)
        expect(perturbedRoot).toMatch(/^[a-f0-9]{64}$/)
    })

    // -------------------------------------------------------------------------
    // 2. Prefix Pruning & Cryptographic Tail Rewiring
    // -------------------------------------------------------------------------
    it('INVARIANT-2: Prefix Pruning & Cryptographic Tail Rewiring', async () => {
        let chain: LedgerEntry[] = [
            await createGenesisBlock('task-compact-inv2'),
        ]
        for (let i = 1; i <= 25; i++) {
            chain = await appendLedgerEntry(chain, 'TASK_EVENT', { step: i })
        }
        expect(chain).toHaveLength(26)

        // Compact with keepTailCount = 5
        const compacted = await compactLedger(chain, undefined, 5)

        // Retains exactly 5 blocks in activeTail (indexes 21..25)
        expect(compacted.activeTail).toHaveLength(5)
        expect(compacted.activeTail[0].index).toBe(21)
        expect(compacted.activeTail[4].index).toBe(25)

        // Checkpoint metrics
        expect(compacted.checkpoint.prunedBlockCount).toBe(21)
        expect(compacted.checkpoint.compactedThroughIndex).toBe(20)

        // Tail head rewiring
        expect(compacted.activeTail[0].previousHash).toBe(
            compacted.checkpoint.checkpointHash,
        )

        // Audit verification
        const audit = await verifyCompactedLedger(compacted)
        expect(audit.valid).toBe(true)
    })

    // -------------------------------------------------------------------------
    // 3. Tamper Detection on Checkpoint & Tail Linkage
    // -------------------------------------------------------------------------
    it('INVARIANT-3: Tamper Detection on Checkpoint & Tail Linkage', async () => {
        let chain: LedgerEntry[] = [
            await createGenesisBlock('task-compact-inv3'),
        ]
        for (let i = 1; i <= 15; i++) {
            chain = await appendLedgerEntry(chain, 'TASK_EVENT', { step: i })
        }
        const compacted = await compactLedger(chain, undefined, 5)

        // 3a. Mutate a single integer in prunedBlockCount
        const tamperedMeta = JSON.parse(JSON.stringify(compacted))
        tamperedMeta.checkpoint.prunedBlockCount += 1
        const resMeta = await verifyCompactedLedger(tamperedMeta)
        expect(resMeta.valid).toBe(false)
        expect(resMeta.error).toBe('CHECKPOINT_HASH_TAMPERED')

        // 3b. Mutate a single integer in eventSummary
        const tamperedSummary = JSON.parse(JSON.stringify(compacted))
        tamperedSummary.checkpoint.eventSummary['TASK_EVENT'] = 999
        const resSummary = await verifyCompactedLedger(tamperedSummary)
        expect(resSummary.valid).toBe(false)
        expect(resSummary.error).toBe('CHECKPOINT_HASH_TAMPERED')

        // 3c. Restore checkpoint and alter activeTail[0].previousHash = 'deadbeef'
        const tamperedTail = JSON.parse(JSON.stringify(compacted))
        tamperedTail.activeTail[0].previousHash = 'deadbeef'
        const resTail = await verifyCompactedLedger(tamperedTail)
        expect(resTail.valid).toBe(false)
        expect(resTail.error).toBe('TAIL_HEAD_CHECKPOINT_DISCONTINUITY')
    })

    // -------------------------------------------------------------------------
    // 4. Auto-Compaction Threshold Trigger (N >= 50)
    // -------------------------------------------------------------------------
    it('INVARIANT-4: Auto-Compaction Threshold Trigger (N >= 50)', async () => {
        const mockCtx = new MockDurableObjectContext()
        const coordinator = new ShotCoordinatorDO(mockCtx as any, {})

        // Enqueue 50 sequential tasks with unique idempotency keys
        for (let i = 0; i < 50; i++) {
            const res = await coordinator.fetch(
                new Request('https://do.internal/enqueue', {
                    method: 'POST',
                    body: JSON.stringify({
                        taskId: `task-inv4-${i}`,
                        idempotencyKey: `idemp-inv4-${i}`,
                        artistId: `artist-${i % 3}`,
                    }),
                }),
            )
            expect(res.status).toBe(200)
        }

        // Active in-memory tail shrinks to 10 blocks (DEFAULT_KEEP_TAIL_BLOCKS)
        const storageChain = await mockCtx.storage.get('ledger_chain')
        const storageCheckpoint = await mockCtx.storage.get('ledger_checkpoint')

        expect(storageChain).toBeDefined()
        expect(storageChain).toHaveLength(10)
        expect(storageCheckpoint).toBeDefined()
        expect(storageCheckpoint.checkpointIndex).toBe(0)
        expect(storageCheckpoint.prunedBlockCount).toBe(40)
        expect(storageCheckpoint.compactedThroughIndex).toBe(39)

        // Verification endpoint returns HTTP 200 with ok: true
        const verifyRes = await coordinator.fetch(
            new Request('https://do.internal/ledger/compact/verify'),
        )
        expect(verifyRes.status).toBe(200)
        const verifyData = (await verifyRes.json()) as any
        expect(verifyData.ok).toBe(true)
        expect(verifyData.valid).toBe(true)
    })

    // -------------------------------------------------------------------------
    // 5. Multi-Channel Concurrent Fan-Out & Fault Isolation
    // -------------------------------------------------------------------------
    it('INVARIANT-5: Multi-Channel Concurrent Fan-Out & Fault Isolation', async () => {
        const originalFetch = globalThis.fetch
        let fleetCallCount = 0

        globalThis.fetch = vi.fn().mockImplementation((url: string) => {
            if (url.includes('fleet-only-endpoint')) {
                fleetCallCount++
                return Promise.resolve(
                    new Response(JSON.stringify({ ok: true }), { status: 200 }),
                )
            }
            if (url.includes('failing-sub-endpoint')) {
                const err = new Error('The operation was aborted')
                err.name = 'AbortError'
                return Promise.reject(err)
            }
            return Promise.resolve(
                new Response(JSON.stringify({ ok: true }), { status: 200 }),
            )
        })

        const broadcaster = new TelemetryBroadcaster()
        broadcaster.registerSubscriber({
            id: 'sub_responsive',
            url: 'https://telemetry.internal/responsive-sub-endpoint',
            channels: ['COMPACTION'],
        })
        broadcaster.registerSubscriber({
            id: 'sub_timing_out',
            url: 'https://telemetry.internal/failing-sub-endpoint',
            channels: ['COMPACTION'],
        })
        broadcaster.registerSubscriber({
            id: 'sub_fleet_only',
            url: 'https://telemetry.internal/fleet-only-endpoint',
            channels: ['FLEET'],
        })

        const receipt = await broadcaster.broadcast('COMPACTION', {
            checkpoint: {
                checkpointIndex: 2,
                compactedThroughIndex: 100,
                prunedBlockCount: 90,
                checkpointHash: 'checkpoint-hash-test',
                merkleRoot: 'merkle-root-test',
                eventSummary: { TASK_RUN: 90 },
            },
        })

        // Dispatched = 1, Failed = 1
        expect(receipt.dispatchedCount).toBe(1)
        expect(receipt.failedCount).toBe(1)

        // Fleet subscriber receives 0 transmissions on COMPACTION
        expect(fleetCallCount).toBe(0)

        globalThis.fetch = originalFetch
    })

    // -------------------------------------------------------------------------
    // 6. Deterministic 7-Bit ASCII Telemetry Compliance
    // -------------------------------------------------------------------------
    it('INVARIANT-6: Deterministic 7-Bit ASCII Telemetry Compliance', async () => {
        let chain: LedgerEntry[] = [
            await createGenesisBlock('task-compact-inv6'),
        ]
        for (let i = 1; i <= 5; i++) {
            chain = await appendLedgerEntry(chain, 'TASK_EVENT', { step: i })
        }
        const compacted = await compactLedger(chain, undefined, 2)

        const compactionText = formatCompactionBroadcast(compacted.checkpoint)
        const genericText = formatGenericTelemetryFrame('FLEET', {
            status: 'ONLINE',
            nodes: 4,
        })

        // Zero multi-byte characters
        expect(compactionText).not.toMatch(/[\uD800-\uDFFF]/)
        expect(compactionText).not.toMatch(/[^\x00-\x7F]/)
        expect(genericText).not.toMatch(/[\uD800-\uDFFF]/)
        expect(genericText).not.toMatch(/[^\x00-\x7F]/)

        // Markdown code fences and ASCII tokens
        expect(compactionText.startsWith('```text')).toBe(true)
        expect(compactionText.endsWith('```')).toBe(true)
        expect(compactionText).toContain('>> [TELEMETRY:COMPACTION]')

        expect(genericText.startsWith('```text')).toBe(true)
        expect(genericText.endsWith('```')).toBe(true)
        expect(genericText).toContain('>> [TELEMETRY:FLEET]')
    })
})
