import type { ValidationGateFailure } from './validation.interface'
import type { VersionsManifest } from './versions.interface'

export type CircuitBreakerClassification =
    | 'PERSISTENT_SCHEMA_VIOLATION'
    | 'CAS_REACHABILITY_FAILURE'
    | 'MONOTONIC_SAT_FAILURE'
    | 'OPERATOR_ABORT'

export interface CircuitBreakerDossier {
    escalation_event: 'LOCKFILE_HUMAN_GATE_BREAKER_TRIPPED'
    timestamp: string
    operator: string
    failure_class: CircuitBreakerClassification
    attempts_recorded: number
    last_error: string
    failures: ValidationGateFailure[]
    remediation: string
    canonical_preserved: boolean
}

export interface HumanGateResolutionResult {
    resolved: boolean
    attempts: number
    tripped: boolean
    manifest?: VersionsManifest
    dossier?: CircuitBreakerDossier
    scratchpadPath: string
    canonicalPath: string
}
