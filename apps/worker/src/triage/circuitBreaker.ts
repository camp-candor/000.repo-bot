import type { DriftClassification } from './visualScanTrace.js'

export type TrajectoryMode = 'CONVERGENCE' | 'DIVERGENCE'

export type CircuitBreakerStatus =
    | 'ALLOW_CYCLE_RETRY'
    | 'CIRCUIT_BREAKER_TRIPPED'
    | 'DIVERGENT_STRUCTURAL_CONFLICT'

export interface AuditCycleRecord {
    attempt: number
    classification: DriftClassification
    errorTokens: string[]
    timestampMs: number
}

export interface EscalationDossier {
    taskId: string
    candidateSha: string
    exhaustedAttempts: number
    trajectory: TrajectoryMode
    status: 'BLOCKED'
    history: AuditCycleRecord[]
    contradictionSummary: string
    generatedAtIso: string
}

export interface CircuitBreakerEvaluation {
    status: CircuitBreakerStatus
    trajectory: TrajectoryMode
    attempt: number
    dossier?: EscalationDossier
}

const SEVERITY_RANK: Record<DriftClassification, number> = {
    HARMLESS_FLOAT_NOISE: 1,
    LIGHTING_CURVE_SHIFT: 2,
    ANATOMICAL_COLLAPSE: 3,
    CANON_INVARIANT_BREACH: 4,
}

/**
 * Analyzes error trajectory across sequential remediation attempts.
 */
export function analyzeTrajectory(history: AuditCycleRecord[]): TrajectoryMode {
    if (history.length <= 1) {
        return 'CONVERGENCE'
    }

    const previous = history[history.length - 2]
    const current = history[history.length - 1]

    // If classification jumped across structural categories (e.g. lighting -> anatomical collapse)
    if (previous.classification !== current.classification) {
        const severityDelta =
            SEVERITY_RANK[current.classification] -
            SEVERITY_RANK[previous.classification]
        // If error escalated or mutated category unexpectedly, flag divergence
        if (
            severityDelta > 0 ||
            (severityDelta !== 0 &&
                current.classification === 'CANON_INVARIANT_BREACH')
        ) {
            return 'DIVERGENCE'
        }
    }

    return 'CONVERGENCE'
}

/**
 * Evaluates the Three-Cycle Escalation Rule and triggers circuit breaker halts on divergence.
 */
export function evaluateCircuitBreaker(
    taskId: string,
    candidateSha: string,
    history: AuditCycleRecord[],
    maxAttempts = 3,
): CircuitBreakerEvaluation {
    const latestAttempt =
        history.length > 0 ? history[history.length - 1].attempt : 1
    const trajectory = analyzeTrajectory(history)

    // Divergence: Immediate hard pipeline halt
    if (trajectory === 'DIVERGENCE') {
        console.error(
            `>> [CIRCUIT_BREAKER:DIVERGE] Task '${taskId}' diverged across structural categories [HALT]`,
        )
        return {
            status: 'DIVERGENT_STRUCTURAL_CONFLICT',
            trajectory: 'DIVERGENCE',
            attempt: latestAttempt,
            dossier: buildEscalationDossier(
                taskId,
                candidateSha,
                history,
                trajectory,
            ),
        }
    }

    // Attempt ceiling reached: Tripped circuit breaker
    if (latestAttempt >= maxAttempts) {
        console.error(
            `>> [CIRCUIT_BREAKER:TRIPPED] Task '${taskId}' reached attempt ceiling (${latestAttempt}/${maxAttempts}) [HALT]`,
        )
        return {
            status: 'CIRCUIT_BREAKER_TRIPPED',
            trajectory: 'CONVERGENCE',
            attempt: latestAttempt,
            dossier: buildEscalationDossier(
                taskId,
                candidateSha,
                history,
                trajectory,
            ),
        }
    }

    // Convergence and attempt budget remains: Allow Cycle 2 or 3 micro-prompt retry
    console.log(
        `>> [CIRCUIT_BREAKER:CONVERGE] Task '${taskId}' in convergence basin. Permitting attempt ${latestAttempt + 1} [RETRY]`,
    )
    return {
        status: 'ALLOW_CYCLE_RETRY',
        trajectory: 'CONVERGENCE',
        attempt: latestAttempt,
    }
}

export function buildEscalationDossier(
    taskId: string,
    candidateSha: string,
    history: AuditCycleRecord[],
    trajectory: TrajectoryMode,
): EscalationDossier {
    const summary = history
        .map(
            (h) =>
                `[Attempt ${h.attempt}] ${h.classification}: ${h.errorTokens.join(', ')}`,
        )
        .join(' -> ')

    return {
        taskId,
        candidateSha,
        exhaustedAttempts: history.length,
        trajectory,
        status: 'BLOCKED',
        history,
        contradictionSummary: `Structural conflict detected. Trajectory: ${trajectory}. Sequence: ${summary}`,
        generatedAtIso: new Date().toISOString(),
    }
}
