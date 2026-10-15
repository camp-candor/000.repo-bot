import type { VersionsManifest } from './versions.interface'

export type ValidationGateType =
    'GATE_1_SYNTAX_SCHEMA' | 'GATE_2_CAS_COMMIT' | 'GATE_3_MONOTONIC_SAT'

export interface ValidationGateFailure {
    gate: ValidationGateType
    repo?: string
    field?: string
    message: string
}

export interface ValidationGateReport {
    valid: boolean
    gate1Passed: boolean
    gate2Passed: boolean
    gate3Passed: boolean
    failures: ValidationGateFailure[]
    manifest?: VersionsManifest
    cleanedContent?: string
    timestamp: string
}

export interface ValidationOptions {
    checkGitReachability?: boolean
    fleetRoot?: string
}
