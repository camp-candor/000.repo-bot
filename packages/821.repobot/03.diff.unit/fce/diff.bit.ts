export interface WhitelistConformanceResult {
    valid: boolean
    reason?: string
    unapprovedFiles?: readonly string[]
}

export interface DiffFilePayload {
    path: string
}

export default interface DiffBit {
    idx: string
    files?: readonly DiffFilePayload[]
    fileWhitelist?: readonly string[]
    whitelistResult?: WhitelistConformanceResult
}
