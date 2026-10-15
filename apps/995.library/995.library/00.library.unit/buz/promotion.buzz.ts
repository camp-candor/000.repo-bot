import { createHash } from 'crypto'
import path from 'path'
import fs from 'fs-extra'
import type { LibraryModel } from '../library.model'
import type LibraryBit from '../fce/library.bit'
import type State from '../../99.core/state'
import type { VersionsManifest } from '../fce/versions.interface'
import type {
    LockfileLedgerEntry,
    LockfileLedgerEventType,
    LockfilePromotionReceipt,
    PromoteLockfileOptions,
} from '../fce/promotion.interface'
import * as ActCns from '../../83.console.unit/console.action'
import { retryAtomicRename } from './library.buzz'
import { stripConflictComments } from './validation.buzz'

const GENESIS_BLOCK_HASH =
    '0000000000000000000000000000000000000000000000000000000000000000'

/**
 * Computes deterministic RFC 8785-compliant canonical JSON SHA-256 digest.
 */
export const computeCanonicalManifestHash = (
    content: string | object,
): string => {
    let normalized = ''
    if (typeof content === 'string') {
        const cleaned = stripConflictComments(content)
        const parsed = JSON.parse(cleaned)
        normalized = JSON.stringify(sortObjectKeys(parsed))
    } else {
        normalized = JSON.stringify(sortObjectKeys(content))
    }

    return createHash('sha256').update(normalized, 'utf8').digest('hex')
}

/**
 * Deterministically sorts object keys recursively for canonical JSON representation.
 */
function sortObjectKeys(obj: any): any {
    if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
        return obj
    }
    const sorted: Record<string, any> = {}
    Object.keys(obj)
        .sort()
        .forEach((key) => {
            sorted[key] = sortObjectKeys(obj[key])
        })
    return sorted
}

/**
 * Retrieves the last entry in the NDJSON audit ledger to chain block hashes.
 */
export const readLastLedgerEntry = async (
    ledgerPath: string,
): Promise<LockfileLedgerEntry | null> => {
    if (!(await fs.pathExists(ledgerPath))) {
        return null
    }
    const lines = (await fs.readFile(ledgerPath, 'utf8'))
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0)

    if (lines.length === 0) return null

    try {
        return JSON.parse(lines[lines.length - 1]) as LockfileLedgerEntry
    } catch {
        return null
    }
}

/**
 * Mints an immutable, cryptographically hash-chained entry to the NDJSON audit ledger.
 */
export const mintLockfileLedgerEntry = async (params: {
    ledgerPath: string
    eventType: LockfileLedgerEventType
    operator: string
    canonicalPath: string
    preHash: string
    postHash: string
    manifest: VersionsManifest
}): Promise<LockfileLedgerEntry> => {
    const {
        ledgerPath,
        eventType,
        operator,
        canonicalPath,
        preHash,
        postHash,
        manifest,
    } = params

    await fs.ensureDir(path.dirname(ledgerPath))
    const lastEntry = await readLastLedgerEntry(ledgerPath)

    const index = lastEntry ? lastEntry.index + 1 : 1
    const previousBlockHash = lastEntry
        ? lastEntry.block_hash
        : GENESIS_BLOCK_HASH
    const timestamp = new Date().toISOString()

    const repositoriesModified = Object.keys(manifest.repositories || {}).sort()

    const payloadToHash = `${index}|${timestamp}|${eventType}|${operator}|${canonicalPath}|${preHash}|${postHash}|${previousBlockHash}`
    const blockHash = createHash('sha256')
        .update(payloadToHash, 'utf8')
        .digest('hex')

    const entry: LockfileLedgerEntry = {
        index,
        timestamp,
        event_type: eventType,
        operator,
        canonical_path: canonicalPath,
        pre_hash: preHash,
        post_hash: postHash,
        previous_block_hash: previousBlockHash,
        block_hash: blockHash,
        diff_summary: {
            repositories_modified: repositoriesModified,
            library_version: manifest.library_version || '1.0.12',
        },
    }

    await fs.appendFile(ledgerPath, JSON.stringify(entry) + '\n', 'utf8')
    return entry
}

/**
 * Executes atomic promotion of the validated scratchpad into production canonical path.
 */
export const promoteLockfileScratchpad = async (
    cpy: LibraryModel,
    bal: LibraryBit,
    ste: State,
): Promise<LibraryModel> => {
    const emit = async (src: string) => {
        if (ste && typeof ste.hunt === 'function') {
            await ste
                .hunt(ActCns.UPDATE_CONSOLE, { idx: 'cns00', src })
                .catch(() => {})
        }
    }

    const scratchpadPath = bal?.src || ''
    const options: PromoteLockfileOptions = (bal?.dat as any) || {}
    const canonicalPath =
        options.canonicalPath ||
        path.resolve(process.cwd(), 'data', 'versions.json')
    const ledgerPath =
        options.ledgerPath ||
        path.resolve(process.cwd(), 'data', 'ledger', 'lockfile.ledger.ndjson')
    const operator = options.operator || 'LOCAL_ARCHITECT'
    const eventType: LockfileLedgerEventType =
        options.eventType || 'LOCKFILE_RESOLVED'

    if (!scratchpadPath || !(await fs.pathExists(scratchpadPath))) {
        const errMsg = `Scratchpad payload file missing: ${scratchpadPath}`
        await emit(`:: [PROMOTION:ERR] ${errMsg}`)
        if (bal?.slv) {
            bal.slv({
                libBit: {
                    idx: 'promote-lockfile-scratchpad-error',
                    src: errMsg,
                    val: -1,
                },
            })
        }
        return cpy
    }

    await emit(
        `>> [PROMOTION] Commencing atomic promotion: ${path.basename(scratchpadPath)} -> ${path.basename(canonicalPath)}`,
    )

    let preHash = GENESIS_BLOCK_HASH
    let canonicalBackupPath = ''
    let backupCreated = false

    try {
        // Step 1: Ingest and hash pre-resolution canonical manifest if present
        if (await fs.pathExists(canonicalPath)) {
            const preContent = await fs.readFile(canonicalPath, 'utf8')
            preHash = computeCanonicalManifestHash(preContent)

            // Create temporary sibling backup for fail-safe rollback compensation
            const nonce = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
            canonicalBackupPath = path.join(
                path.dirname(canonicalPath),
                `.tmp_backup_canonical_${nonce}.json`,
            )
            await retryAtomicRename(canonicalPath, canonicalBackupPath)
            backupCreated = true
        }

        // Step 2: Read, sanitize, and validate scratchpad JSON payload
        const scratchpadRaw = await fs.readFile(scratchpadPath, 'utf8')
        const cleanedScratchpad = stripConflictComments(scratchpadRaw)
        const parsedManifest: VersionsManifest = JSON.parse(cleanedScratchpad)
        const postHash = computeCanonicalManifestHash(cleanedScratchpad)

        // Write sanitized canonical formatting directly to scratchpad before atomic swap
        await fs.writeFile(
            scratchpadPath,
            JSON.stringify(parsedManifest, null, 2) + '\n',
            'utf8',
        )

        // Step 3: Atomically promote scratchpad to canonical manifest path
        await retryAtomicRename(scratchpadPath, canonicalPath)

        // Step 4: Mint hash-chained entry to historical audit ledger
        const ledgerEntry = await mintLockfileLedgerEntry({
            ledgerPath,
            eventType,
            operator,
            canonicalPath,
            preHash,
            postHash,
            manifest: parsedManifest,
        })

        // Step 5: Teardown backup after verified atomic promotion
        if (backupCreated && (await fs.pathExists(canonicalBackupPath))) {
            await fs.remove(canonicalBackupPath).catch(() => {})
        }

        const receipt: LockfilePromotionReceipt = {
            promoted: true,
            canonicalPath,
            scratchpadPath,
            preHash,
            postHash,
            ledgerEntry,
            timestamp: ledgerEntry.timestamp,
        }

        await emit(
            `>> [PROMOTION] [OK] Promoted manifest ${postHash.slice(0, 8)}... (Block #${ledgerEntry.index} minted)`,
        )

        if (bal?.slv) {
            bal.slv({
                libBit: {
                    idx: 'promote-lockfile-scratchpad',
                    val: ledgerEntry.index,
                    src: canonicalPath,
                    dat: receipt,
                },
            })
        }
    } catch (err: any) {
        await emit(
            `:: [PROMOTION:FAIL] Promotion faulted: ${err.message}. Initiating rollback compensation...`,
        )

        // Compensation: Restore canonical manifest from backup if atomic swap failed
        if (
            backupCreated &&
            (await fs.pathExists(canonicalBackupPath)) &&
            !(await fs.pathExists(canonicalPath))
        ) {
            try {
                await retryAtomicRename(canonicalBackupPath, canonicalPath)
                await emit(
                    `>> [COMPENSATION] [OK] Restored original canonical manifest from backup.`,
                )
            } catch (restoreErr: any) {
                await emit(
                    `:: [CRITICAL] Failed to restore canonical backup: ${restoreErr.message}`,
                )
            }
        }

        if (bal?.slv) {
            bal.slv({
                libBit: {
                    idx: 'promote-lockfile-scratchpad-error',
                    src: err.message,
                    val: -1,
                },
            })
        }
    }

    return cpy
}

/**
 * Dispatches historical audit ledger minting standalone action.
 */
export const mintLockfileLedger = async (
    cpy: LibraryModel,
    bal: LibraryBit,
    _ste: State,
): Promise<LibraryModel> => {
    try {
        const dat = (bal?.dat as any) || {}
        const ledgerPath =
            bal?.src ||
            path.resolve(
                process.cwd(),
                'data',
                'ledger',
                'lockfile.ledger.ndjson',
            )
        const entry = await mintLockfileLedgerEntry({
            ledgerPath,
            eventType: dat.eventType || 'LOCKFILE_RESOLVED',
            operator: dat.operator || 'LOCAL_ARCHITECT',
            canonicalPath:
                dat.canonicalPath ||
                path.resolve(process.cwd(), 'data', 'versions.json'),
            preHash: dat.preHash || GENESIS_BLOCK_HASH,
            postHash: dat.postHash || GENESIS_BLOCK_HASH,
            manifest: dat.manifest || {
                schema_version: 1,
                library_version: '1.0.12',
                repositories: {},
            },
        })

        if (bal?.slv) {
            bal.slv({
                libBit: {
                    idx: 'mint-lockfile-ledger',
                    val: entry.index,
                    src: ledgerPath,
                    dat: entry,
                },
            })
        }
    } catch (err: any) {
        if (bal?.slv) {
            bal.slv({
                libBit: {
                    idx: 'mint-lockfile-ledger-error',
                    src: err.message,
                    val: -1,
                },
            })
        }
    }

    return cpy
}
