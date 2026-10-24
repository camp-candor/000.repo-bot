import type { VersionsManifest } from './versions.interface'

export type LockfileLedgerEventType = 'LOCKFILE_RESOLVED' | 'DIRECTOR_OVERRIDE'

export interface LockfileLedgerEntry {
    index: number
    timestamp: string
    event_type: LockfileLedgerEventType
    operator: string
    canonical_path: string
    pre_hash: string
    post_hash: string
    previous_block_hash: string
    block_hash: string
    diff_summary: {
        repositories_modified: string[]
        library_version: string
    }
}

export interface LockfilePromotionReceipt {
    promoted: boolean
    canonicalPath: string
    scratchpadPath: string
    preHash: string
    postHash: string
    ledgerEntry: LockfileLedgerEntry
    timestamp: string
}

export interface PromoteLockfileOptions {
    operator?: string
    eventType?: LockfileLedgerEventType
    canonicalPath?: string
    ledgerPath?: string
}
