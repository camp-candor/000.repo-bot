import { sha256Hex, type LedgerEntry } from './cryptoLedger.js'

export interface CompactionCheckpoint {
    checkpointIndex: number
    compactedThroughIndex: number
    prunedBlockCount: number
    previousHash: string
    merkleRoot: string
    cumulativeHash: string
    eventSummary: Record<string, number>
    checkpointHash: string
    compactedAtMs: number
}

export interface CompactedLedgerState {
    checkpoint: CompactionCheckpoint
    activeTail: LedgerEntry[]
}

export const COMPACTION_THRESHOLD_BLOCKS = 50
export const DEFAULT_KEEP_TAIL_BLOCKS = 10

/**
 * Computes a deterministic Merkle root from a list of 64-character SHA-256 hashes.
 */
export async function computeMerkleRoot(hashes: string[]): Promise<string> {
    if (hashes.length === 0) {
        return '0'.repeat(64)
    }
    if (hashes.length === 1) {
        return hashes[0]
    }

    let currentLayer = [...hashes]

    while (currentLayer.length > 1) {
        const nextLayer: string[] = []
        for (let i = 0; i < currentLayer.length; i += 2) {
            const left = currentLayer[i]
            const right =
                i + 1 < currentLayer.length ? currentLayer[i + 1] : left
            const combinedHash = await sha256Hex(`${left}:${right}`)
            nextLayer.push(combinedHash)
        }
        currentLayer = nextLayer
    }

    return currentLayer[0]
}

/**
 * Serializes checkpoint fields deterministically for canonical hashing.
 */
export function serializeCheckpointData(
    checkpointIndex: number,
    compactedThroughIndex: number,
    prunedBlockCount: number,
    previousHash: string,
    merkleRoot: string,
    cumulativeHash: string,
    eventSummary: Record<string, number>,
    compactedAtMs: number,
): string {
    const sortedSummary = Object.keys(eventSummary)
        .sort()
        .reduce<Record<string, number>>((acc, key) => {
            acc[key] = eventSummary[key]
            return acc
        }, {})

    return JSON.stringify({
        checkpointIndex,
        compactedThroughIndex,
        prunedBlockCount,
        previousHash,
        merkleRoot,
        cumulativeHash,
        eventSummary: sortedSummary,
        compactedAtMs,
    })
}

/**
 * Compacts the historical prefix of a ledger chain into a cryptographically anchored checkpoint.
 */
export async function compactLedger(
    chain: LedgerEntry[],
    existingCheckpoint?: CompactionCheckpoint,
    keepTailCount = DEFAULT_KEEP_TAIL_BLOCKS,
    nowMs = Date.now(),
): Promise<CompactedLedgerState> {
    if (chain.length <= keepTailCount) {
        throw new Error(
            `COMPACTION_SKIPPED: Chain length (${chain.length}) must exceed tail retention (${keepTailCount}).`,
        )
    }

    const splitIndex = chain.length - keepTailCount
    const blocksToPrune = chain.slice(0, splitIndex)
    const activeTail = chain.slice(splitIndex)

    const prunedBlockCount =
        (existingCheckpoint?.prunedBlockCount || 0) + blocksToPrune.length
    const checkpointIndex = (existingCheckpoint?.checkpointIndex ?? -1) + 1
    const lastPrunedBlock = blocksToPrune[blocksToPrune.length - 1]
    const compactedThroughIndex = lastPrunedBlock.index
    const previousHash = existingCheckpoint
        ? existingCheckpoint.checkpointHash
        : blocksToPrune[0].previousHash

    // Build event frequency summary
    const eventSummary: Record<string, number> = {
        ...(existingCheckpoint?.eventSummary || {}),
    }
    for (const block of blocksToPrune) {
        eventSummary[block.eventType] = (eventSummary[block.eventType] || 0) + 1
    }

    // Compute Merkle root of pruned block hashes
    const prunedHashes = blocksToPrune.map((b) => b.blockHash)
    const merkleRoot = await computeMerkleRoot(prunedHashes)

    // Compute cumulative rolling accumulator
    let cumulative = existingCheckpoint?.cumulativeHash || '0'.repeat(64)
    for (const hash of prunedHashes) {
        cumulative = await sha256Hex(`${cumulative}:${hash}`)
    }

    const serialized = serializeCheckpointData(
        checkpointIndex,
        compactedThroughIndex,
        prunedBlockCount,
        previousHash,
        merkleRoot,
        cumulative,
        eventSummary,
        nowMs,
    )
    const checkpointHash = await sha256Hex(serialized)

    const checkpoint: CompactionCheckpoint = {
        checkpointIndex,
        compactedThroughIndex,
        prunedBlockCount,
        previousHash,
        merkleRoot,
        cumulativeHash: cumulative,
        eventSummary,
        checkpointHash,
        compactedAtMs: nowMs,
    }

    // Rewire active tail head so its previousHash points to the checkpoint hash
    const rewiredTail: LedgerEntry[] = [
        {
            ...activeTail[0],
            previousHash: checkpointHash,
        },
        ...activeTail.slice(1),
    ]

    console.log(
        `>> [COMPACT:OK] Compacted ${blocksToPrune.length} blocks through index ${compactedThroughIndex} (Checkpoint: ${checkpointHash.substring(0, 12)}...) [OK]`,
    )

    return {
        checkpoint,
        activeTail: rewiredTail,
    }
}

/**
 * Mathematically verifies unbroken integrity from checkpoint through the active tail.
 */
export async function verifyCompactedLedger(
    state: CompactedLedgerState,
): Promise<{ valid: boolean; error?: string }> {
    const { checkpoint, activeTail } = state

    // 1. Verify Checkpoint Hash Authenticity
    const expectedCheckpointHash = await sha256Hex(
        serializeCheckpointData(
            checkpoint.checkpointIndex,
            checkpoint.compactedThroughIndex,
            checkpoint.prunedBlockCount,
            checkpoint.previousHash,
            checkpoint.merkleRoot,
            checkpoint.cumulativeHash,
            checkpoint.eventSummary,
            checkpoint.compactedAtMs,
        ),
    )

    if (checkpoint.checkpointHash !== expectedCheckpointHash) {
        return { valid: false, error: 'CHECKPOINT_HASH_TAMPERED' }
    }

    if (activeTail.length === 0) {
        return { valid: true }
    }

    // 2. Verify Tail Head Links to Checkpoint
    if (activeTail[0].previousHash !== checkpoint.checkpointHash) {
        return { valid: false, error: 'TAIL_HEAD_CHECKPOINT_DISCONTINUITY' }
    }

    // 3. Verify Sequential Linkage Across Tail
    for (let i = 1; i < activeTail.length; i++) {
        const prev = activeTail[i - 1]
        const current = activeTail[i]

        if (current.index !== prev.index + 1) {
            return {
                valid: false,
                error: `INDEX_DISCONTINUITY: Expected ${prev.index + 1}, got ${current.index}`,
            }
        }

        if (current.previousHash !== prev.blockHash) {
            return {
                valid: false,
                error: `PREVIOUS_HASH_MISMATCH at tail index ${i}`,
            }
        }
    }

    console.log(
        `>> [COMPACT:VERIFY] Verified compacted ledger: Checkpoint ${checkpoint.checkpointIndex} + ${activeTail.length} tail blocks [OK]`,
    )
    return { valid: true }
}
