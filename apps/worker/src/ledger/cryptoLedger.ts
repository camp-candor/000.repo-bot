export interface LedgerEntry {
    index: number
    previousHash: string
    timestampMs: number
    eventType: string
    payload: Record<string, any>
    blockHash: string
}

export interface LedgerAuditResult {
    valid: boolean
    brokenIndex?: number
    error?: string
}

export const GENESIS_PREVIOUS_HASH = '0'.repeat(64)

/**
 * Computes a standard SHA-256 hex digest using Web Crypto API.
 */
export async function sha256Hex(data: string): Promise<string> {
    const encoder = new TextEncoder()
    const buffer = encoder.encode(data)
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Serializes block data into canonical deterministic string representation.
 */
export function serializeBlockData(
    index: number,
    previousHash: string,
    timestampMs: number,
    eventType: string,
    payload: Record<string, any>,
): string {
    return JSON.stringify({
        index,
        previousHash,
        timestampMs,
        eventType,
        payload,
    })
}

/**
 * Creates and hashes the initial Genesis block for a task ledger.
 */
export async function createGenesisBlock(
    taskId: string,
    initialPayload: Record<string, any> = {},
): Promise<LedgerEntry> {
    const index = 0
    const previousHash = GENESIS_PREVIOUS_HASH
    const timestampMs = Date.now()
    const eventType = 'TASK_GENESIS'
    const payload = { taskId, ...initialPayload }

    const serialized = serializeBlockData(
        index,
        previousHash,
        timestampMs,
        eventType,
        payload,
    )
    const blockHash = await sha256Hex(serialized)

    return {
        index,
        previousHash,
        timestampMs,
        eventType,
        payload,
        blockHash,
    }
}

/**
 * Appends a new verified block to the hash chain.
 */
export async function appendLedgerEntry(
    chain: LedgerEntry[],
    eventType: string,
    payload: Record<string, any>,
    timestampMs: number = Date.now(),
): Promise<LedgerEntry[]> {
    if (chain.length === 0) {
        throw new Error(
            'LEDGER_INVALID: Cannot append to an empty chain. Genesis block required.',
        )
    }

    const previousBlock = chain[chain.length - 1]
    const index = previousBlock.index + 1
    const previousHash = previousBlock.blockHash

    const serialized = serializeBlockData(
        index,
        previousHash,
        timestampMs,
        eventType,
        payload,
    )
    const blockHash = await sha256Hex(serialized)

    const newEntry: LedgerEntry = {
        index,
        previousHash,
        timestampMs,
        eventType,
        payload,
        blockHash,
    }

    console.log(
        `>> [LEDGER:APPEND] Appended block ${index} (${eventType}) Hash: ${blockHash.substring(0, 12)}... [OK]`,
    )
    return [...chain, newEntry]
}

/**
 * Verifies the mathematical integrity of the entire cryptographic hash chain.
 */
export async function verifyLedgerIntegrity(
    chain: LedgerEntry[],
): Promise<LedgerAuditResult> {
    if (chain.length === 0) {
        return { valid: false, error: 'CHAIN_EMPTY' }
    }

    // Verify Genesis block
    const genesis = chain[0]
    if (genesis.index !== 0 || genesis.previousHash !== GENESIS_PREVIOUS_HASH) {
        return {
            valid: false,
            brokenIndex: 0,
            error: 'INVALID_GENESIS_POINTER',
        }
    }

    const expectedGenesisHash = await sha256Hex(
        serializeBlockData(
            genesis.index,
            genesis.previousHash,
            genesis.timestampMs,
            genesis.eventType,
            genesis.payload,
        ),
    )

    if (genesis.blockHash !== expectedGenesisHash) {
        return { valid: false, brokenIndex: 0, error: 'GENESIS_HASH_MISMATCH' }
    }

    // Sequentially verify downstream links
    for (let i = 1; i < chain.length; i++) {
        const prev = chain[i - 1]
        const current = chain[i]

        // 1. Index continuity
        if (current.index !== prev.index + 1) {
            return {
                valid: false,
                brokenIndex: i,
                error: `INDEX_DISCONTINUITY: Expected ${prev.index + 1}, found ${current.index}`,
            }
        }

        // 2. Previous hash pointer continuity
        if (current.previousHash !== prev.blockHash) {
            return {
                valid: false,
                brokenIndex: i,
                error: `PREVIOUS_HASH_MISMATCH at block ${i}`,
            }
        }

        // 3. Current block hash integrity
        const calculatedHash = await sha256Hex(
            serializeBlockData(
                current.index,
                current.previousHash,
                current.timestampMs,
                current.eventType,
                current.payload,
            ),
        )

        if (current.blockHash !== calculatedHash) {
            return {
                valid: false,
                brokenIndex: i,
                error: `BLOCK_HASH_TAMPERED at block ${i}`,
            }
        }
    }

    console.log(
        `>> [LEDGER:AUDIT] Verified unbroken cryptographic integrity across ${chain.length} blocks [OK]`,
    )
    return { valid: true }
}
