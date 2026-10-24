export type AuditStatus =
    | 'ALIGNED'
    | 'DRIFT_VERSION'
    | 'DRIFT_BRANCH'
    | 'MISSING'
    | 'UNMANAGED'
    | 'UNREADABLE'

export interface RepoAuditRecord {
    repo: string
    cluster?: string
    path: string
    expectedVersion: string
    installedVersion?: string
    expectedBranch: string
    actualBranch?: string
    pinnedSha?: string
    actualSha?: string
    status: AuditStatus
    notes?: string
}

export interface AuditReport {
    isSovereign: boolean
    sovereignRepo: string
    activeRepo: string
    totalTracked: number
    alignedCount: number
    driftedCount: number
    records: RepoAuditRecord[]
    timestamp: string
}
