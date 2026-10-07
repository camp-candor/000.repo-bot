import type { CandidatePlate, GauntletResult } from '../triage/driftGauntlet.js'
import type { ExecutionJob } from '../queue/fairQueue.js'
import type { EscalationDossier } from '../triage/circuitBreaker.js'
import {
    synthesizeRemediatedPrompt,
    type PromptPayload,
} from './promptSynthesizer.js'

export type RemediationOutcomeStatus =
    'APPROVED' | 'RETRY_SCHEDULED' | 'HALTED_BLOCKED' | 'FATAL_FORMAT_ERROR'

export interface RemediationOutcome {
    status: RemediationOutcomeStatus
    remediatedJob?: ExecutionJob
    dossier?: EscalationDossier
    diagnostic: string
}

export class RemediationEngine {
    /**
     * Evaluates gauntlet results and autonomously synthesizes a corrected task payload.
     */
    public evaluateAndRemediate(
        candidate: CandidatePlate,
        gauntletResult: GauntletResult,
        currentJob: ExecutionJob,
    ): RemediationOutcome {
        // 1. Clean Pass: No remediation required
        if (gauntletResult.passed) {
            console.log(
                `>> [REMEDIATE:PASS] Candidate '${candidate.candidateSha}' passed all gauntlet tiers [OK]`,
            )
            return {
                status: 'APPROVED',
                diagnostic: gauntletResult.diagnostic,
            }
        }

        // 2. Format Violation: Cannot be fixed via prompt engineering
        if (gauntletResult.terminalStage === 'TIER_1') {
            console.error(
                `>> [REMEDIATE:FATAL] Candidate '${candidate.candidateSha}' failed Tier 1 pixel/format checks [FAIL]`,
            )
            return {
                status: 'FATAL_FORMAT_ERROR',
                diagnostic: gauntletResult.diagnostic,
            }
        }

        // 3. Inspect Circuit Breaker Status
        const cb = gauntletResult.circuitBreaker
        if (
            cb &&
            (cb.status === 'CIRCUIT_BREAKER_TRIPPED' ||
                cb.status === 'DIVERGENT_STRUCTURAL_CONFLICT')
        ) {
            console.error(
                `>> [REMEDIATE:HALT] Circuit breaker engaged for task '${currentJob.taskId}' (${cb.status}) [HALT]`,
            )
            return {
                status: 'HALTED_BLOCKED',
                dossier: cb.dossier,
                diagnostic: `Circuit breaker tripped. Status: ${cb.status}. Trajectory: ${cb.trajectory}`,
            }
        }

        // 4. Autonomous Prompt Synthesis on ALLOW_CYCLE_RETRY
        if (!gauntletResult.auditReport) {
            return {
                status: 'HALTED_BLOCKED',
                diagnostic: 'Missing VlmAuditReport for remediation synthesis.',
            }
        }

        const rawPrompts: PromptPayload = {
            positivePrompt: currentJob.prompts?.positive || '',
            negativePrompt: currentJob.prompts?.negative || '',
            seed: currentJob.seeds?.[0] ?? 42,
            denoiseStrength: currentJob.prompts?.denoiseStrength ?? 1.0,
            extraParameters: currentJob.prompts?.extraParameters,
        }

        const patchResult = synthesizeRemediatedPrompt(
            rawPrompts,
            gauntletResult.auditReport,
            currentJob.attemptCount,
        )

        // Construct remediated job payload
        const nextAttempt = currentJob.attemptCount + 1
        const remediatedJob: ExecutionJob = {
            ...currentJob,
            attemptCount: nextAttempt,
            seeds: [patchResult.patchedPrompts.seed ?? currentJob.seeds[0] + 1],
            prompts: {
                ...currentJob.prompts,
                positive: patchResult.patchedPrompts.positivePrompt,
                negative: patchResult.patchedPrompts.negativePrompt,
                denoiseStrength: patchResult.patchedPrompts.denoiseStrength,
                lastRemediationDiff: patchResult.diffSummary,
                strategyApplied: patchResult.strategyApplied,
            },
        }

        console.log(
            `>> [REMEDIATE:CYCLE] Task '${currentJob.taskId}' scheduled for Attempt ${nextAttempt}/${currentJob.maxAttempts} [OK]`,
        )

        return {
            status: 'RETRY_SCHEDULED',
            remediatedJob,
            diagnostic: `Remediated via strategy '${patchResult.strategyApplied}'. ${patchResult.diffSummary}`,
        }
    }
}
