import { createHash } from 'node:crypto'

export interface LedgerEntry {
    index: number
    timestampMs: number
    eventType: string
    payload: Record<string, any>
    previousHash: string
    blockHash: string
}

export async function sha256Hex(data: string): Promise<string> {
    return createHash('sha256').update(data).digest('hex')
}

/**
 * Deterministically computes the canonical block hash for an entry.
 */
export async function computeBlockHash(
    entry: Omit<LedgerEntry, 'blockHash'>,
): Promise<string> {
    const payloadStr = JSON.stringify(
        entry.payload,
        Object.keys(entry.payload).sort(),
    )
    const canonicalString = `${entry.index}:${entry.timestampMs}:${entry.eventType}:${entry.previousHash}:${payloadStr}`
    return sha256Hex(canonicalString)
}

/**
 * Initializes a new cryptographic hash chain with a genesis block.
 */
export async function createGenesisBlock(
    taskId: string,
    initialPayload: Record<string, any> = {},
): Promise<LedgerEntry> {
    const entry: Omit<LedgerEntry, 'blockHash'> = {
        index: 0,
        timestampMs: Date.now(),
        eventType: 'GENESIS',
        payload: { taskId, ...initialPayload },
        previousHash: '0'.repeat(64),
    }

    return {
        ...entry,
        blockHash: await computeBlockHash(entry),
    }
}

/**
 * Appends a cryptographically linked entry to the ledger chain.
 */
export async function appendLedgerEntry(
    chain: LedgerEntry[],
    eventType: string,
    payload: Record<string, any>,
): Promise<LedgerEntry[]> {
    if (chain.length === 0) {
        throw new Error(
            'LEDGER_ERROR: Cannot append to an empty chain. Initialize genesis block first.',
        )
    }

    const previousBlock = chain[chain.length - 1]

    const entry: Omit<LedgerEntry, 'blockHash'> = {
        index: previousBlock.index + 1,
        timestampMs: Date.now(),
        eventType,
        payload,
        previousHash: previousBlock.blockHash,
    }

    const blockHash = await computeBlockHash(entry)

    const newBlock: LedgerEntry = { ...entry, blockHash }

    console.log(
        `>> [LEDGER:APPEND] Appended Block ${newBlock.index} (${eventType}) [OK]`,
    )
    return [...chain, newBlock]
}
