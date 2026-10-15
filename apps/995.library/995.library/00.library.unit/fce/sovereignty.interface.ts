export interface SovereigntyCheckResult {
    allowed: boolean
    isSovereign: boolean
    activeRepo: string
    sovereignRepo: string
    allowPeripheryBroadcast: boolean
    reason?: string
}

export interface RewireResult {
    rewired: boolean
    targetDir: string
    unitCount: number
    manifestPath: string
    timestamp: string
}
