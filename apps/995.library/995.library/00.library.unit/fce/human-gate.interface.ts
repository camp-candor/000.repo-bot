export interface ConflictPinDescriptor {
    repo: string
    localSha: string
    remoteSha: string
    baseSha?: string
    notes?: string
}

export interface HumanGateResolutionBit {
    scratchpadPath: string
    canonicalPath: string
    conflicts: ConflictPinDescriptor[]
    resolved: boolean
    attempts: number
    tripped: boolean
    error?: string
}
