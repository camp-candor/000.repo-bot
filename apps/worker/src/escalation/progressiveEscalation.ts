import type {
    AuditCycleRecord,
    TrajectoryMode,
} from '../triage/circuitBreaker.js'
import type { VlmAuditReport } from '../triage/visualScanTrace.js'
import type { ExecutionJob } from '../queue/fairQueue.js'
import type { ComfyWorkflow } from '../remediation/patchPipeline.js'
import {
    synthesizeRemediatedPrompt,
    type PromptPayload,
} from '../remediation/promptSynthesizer.js'
import {
    buildStoryArchitectDossier,
    type StoryArchitectDossier,
} from './storyArchitectDossier.js'

export type EscalationTier =
    | 'TIER_1_MICRO_PROMPT'
    | 'TIER_2_AST_RECONDITION'
    | 'TIER_3_ARCHITECT_ESCALATION'

export interface EscalationContext {
    taskId: string
    candidateSha: string
    attemptCount: number
    maxAttempts: number
    trajectory: TrajectoryMode
    auditHistory: AuditCycleRecord[]
    latestReport: VlmAuditReport
    currentWorkflow?: ComfyWorkflow
    currentJob: ExecutionJob
    ledgerHeadHash?: string
}

export interface EscalationDirective {
    tier: EscalationTier
    action: 'RETRY_MICRO_PATCH' | 'RETRY_MACRO_AST' | 'FREEZE_AND_QUARANTINE'
    remediatedJob?: ExecutionJob
    dossier?: StoryArchitectDossier
    rationale: string
}

export class ProgressiveEscalationEngine {
    /**
     * Evaluates progressive escalation policies and returns actionable directives.
     */
    public evaluateEscalation(context: EscalationContext): EscalationDirective {
        const {
            taskId,
            candidateSha,
            attemptCount,
            maxAttempts,
            trajectory,
            auditHistory,
            latestReport,
            currentJob,
            currentWorkflow,
            ledgerHeadHash = '0'.repeat(64),
        } = context

        // RULE 1: Immediate Divergence Short-Circuit Law
        // If consecutive attempts jump across structural categories, skip Tier 2 immediately!
        if (trajectory === 'DIVERGENCE') {
            console.error(
                `>> [ESCALATE:DIVERGE] Structural divergence detected for '${taskId}'. Bypassing Tier 2 -> Direct Tier 3 [HALT]`,
            )
            const dossier = buildStoryArchitectDossier(
                taskId,
                candidateSha,
                auditHistory,
                trajectory,
                ledgerHeadHash,
            )

            return {
                tier: 'TIER_3_ARCHITECT_ESCALATION',
                action: 'FREEZE_AND_QUARANTINE',
                dossier,
                rationale:
                    'Structural divergence across categories: fast-failed to Tier 3 human quarantine.',
            }
        }

        // RULE 2: Attempt Budget Ceiling
        if (attemptCount >= maxAttempts) {
            console.error(
                `>> [ESCALATE:EXHAUST] Max attempts reached (${attemptCount}/${maxAttempts}) for '${taskId}'. Escalating to Tier 3 [HALT]`,
            )
            const dossier = buildStoryArchitectDossier(
                taskId,
                candidateSha,
                auditHistory,
                trajectory,
                ledgerHeadHash,
            )

            return {
                tier: 'TIER_3_ARCHITECT_ESCALATION',
                action: 'FREEZE_AND_QUARANTINE',
                dossier,
                rationale: `Exhausted ${maxAttempts} automated cycles without convergence.`,
            }
        }

        const rawPrompts: PromptPayload = {
            positivePrompt: currentJob.prompts?.positive || '',
            negativePrompt: currentJob.prompts?.negative || '',
            seed: currentJob.seeds?.[0] ?? 42,
            denoiseStrength: currentJob.prompts?.denoiseStrength ?? 1.0,
            extraParameters: currentJob.prompts?.extraParameters,
        }

        // RULE 3: Tier 1 Micro-Prompt Synthesis (Attempt 1)
        if (attemptCount === 1) {
            console.log(
                `>> [ESCALATE:TIER_1] Applying Tier 1 Micro-Prompt Synthesis for '${taskId}' [RETRY]`,
            )
            const patchResult = synthesizeRemediatedPrompt(
                rawPrompts,
                latestReport,
                attemptCount,
            )
            const nextAttempt = attemptCount + 1
            const baseSeed = currentJob.seeds?.[0] ?? 42
            const perturbedSeed =
                patchResult.patchedPrompts.seed &&
                patchResult.patchedPrompts.seed !== baseSeed
                    ? patchResult.patchedPrompts.seed
                    : baseSeed + 1013

            const remediatedJob: ExecutionJob = {
                ...currentJob,
                attemptCount: nextAttempt,
                seeds: [perturbedSeed],
                prompts: {
                    ...currentJob.prompts,
                    seed: perturbedSeed,
                    positive: patchResult.patchedPrompts.positivePrompt,
                    negative: patchResult.patchedPrompts.negativePrompt,
                    denoiseStrength: patchResult.patchedPrompts.denoiseStrength,
                    lastRemediationDiff: `[Tier 1 Micro] ${patchResult.diffSummary}`,
                    escalationTier: 'TIER_1_MICRO_PROMPT',
                },
            }

            return {
                tier: 'TIER_1_MICRO_PROMPT',
                action: 'RETRY_MICRO_PATCH',
                remediatedJob,
                rationale: `Applied Tier 1 seed perturbation and anchor injection (${patchResult.strategyApplied}).`,
            }
        }

        // RULE 4: Tier 2 Macro-Workflow AST Reconditioning (Attempt 2)
        if (attemptCount === 2) {
            console.log(
                `>> [ESCALATE:TIER_2] Applying Tier 2 Macro-Workflow AST Reconditioning for '${taskId}' [RETRY]`,
            )
            const patchResult = synthesizeRemediatedPrompt(
                rawPrompts,
                latestReport,
                attemptCount,
            )

            // In Tier 2, apply structural conditioning: clamp denoise further, adjust CFG, expand negatives
            const boostedDenoise = Math.max(
                0.35,
                (patchResult.patchedPrompts.denoiseStrength ?? 1.0) - 0.05,
            )
            const sourceWorkflow =
                currentWorkflow || currentJob.prompts?.workflowAst
            let patchedWorkflow = sourceWorkflow
                ? structuredClone(sourceWorkflow)
                : undefined

            if (patchedWorkflow) {
                for (const rawNode of Object.values(patchedWorkflow)) {
                    const node = rawNode as any
                    if (
                        node?.class_type === 'KSampler' ||
                        node?.class_type === 'KSamplerAdvanced'
                    ) {
                        if (node.inputs) {
                            node.inputs.denoise = boostedDenoise
                            node.inputs.cfg = Math.min(
                                9.0,
                                (Number(node.inputs.cfg) || 7.0) + 0.5,
                            ) // Boost prompt guidance
                            node.inputs.steps = Math.min(
                                35,
                                (Number(node.inputs.steps) || 25) + 5,
                            ) // Add refinement steps
                        }
                    }
                }
            }

            const nextAttempt = attemptCount + 1
            const baseSeed = currentJob.seeds?.[0] ?? 42
            const perturbedSeed =
                patchResult.patchedPrompts.seed &&
                patchResult.patchedPrompts.seed !== baseSeed
                    ? patchResult.patchedPrompts.seed
                    : baseSeed + 2048

            const remediatedJob: ExecutionJob = {
                ...currentJob,
                attemptCount: nextAttempt,
                seeds: [perturbedSeed],
                prompts: {
                    ...currentJob.prompts,
                    seed: perturbedSeed,
                    positive: patchResult.patchedPrompts.positivePrompt,
                    negative: patchResult.patchedPrompts.negativePrompt,
                    denoiseStrength: boostedDenoise,
                    workflowAst:
                        patchedWorkflow || currentJob.prompts?.workflowAst,
                    lastRemediationDiff: `[Tier 2 Macro AST] Denoise clamped to ${boostedDenoise}, CFG boosted, Sampler steps refined.`,
                    escalationTier: 'TIER_2_AST_RECONDITION',
                },
            }

            return {
                tier: 'TIER_2_AST_RECONDITION',
                action: 'RETRY_MACRO_AST',
                remediatedJob,
                rationale:
                    'Applied Tier 2 macro-workflow AST reconditioning (CFG boost, denoise clamp, sampler step refinement).',
            }
        }

        // Fallback default (Guaranteed termination)
        const fallbackDossier = buildStoryArchitectDossier(
            taskId,
            candidateSha,
            auditHistory,
            trajectory,
            ledgerHeadHash,
        )

        return {
            tier: 'TIER_3_ARCHITECT_ESCALATION',
            action: 'FREEZE_AND_QUARANTINE',
            dossier: fallbackDossier,
            rationale: 'Fallback quarantine triggered.',
        }
    }
}
