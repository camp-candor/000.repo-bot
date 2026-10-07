import type { CandidatePlate, GauntletResult } from '../triage/driftGauntlet.js'
import type { ExecutionJob } from '../queue/fairQueue.js'
import type { EscalationDossier } from '../triage/circuitBreaker.js'
import {
    synthesizeRemediatedPrompt,
    type PromptPayload,
    type PromptPatchResult,
} from './promptSynthesizer.js'

export interface ComfyNode {
    class_type: string
    inputs: Record<string, any>
    _meta?: Record<string, any>
}

export type ComfyWorkflow = Record<string, ComfyNode>

export type PatchOutcomeStatus =
    'APPROVED' | 'RETRY_SCHEDULED' | 'HALTED_BLOCKED' | 'FATAL_FORMAT_ERROR'

export interface PatchPipelineOutcome {
    status: PatchOutcomeStatus
    remediatedJob?: ExecutionJob
    dossier?: EscalationDossier
    diagnostic: string
}

export class JulesPatchPipeline {
    /**
     * Mutates ComfyUI workflow JSON AST without breaking graph link invariants.
     */
    public applyPatchToWorkflow(
        workflow: ComfyWorkflow,
        patch: PromptPatchResult,
    ): ComfyWorkflow {
        const mutated: ComfyWorkflow = structuredClone(workflow)

        // Scan AST for KSampler and CLIP text nodes
        for (const [nodeId, node] of Object.entries(mutated)) {
            const classType = node.class_type

            // Patch Sampler seed and denoise
            if (classType === 'KSampler' || classType === 'KSamplerAdvanced') {
                if (patch.patchedPrompts.seed !== undefined) {
                    node.inputs.seed = patch.patchedPrompts.seed
                }
                if (
                    patch.patchedPrompts.denoiseStrength !== undefined &&
                    'denoise' in node.inputs
                ) {
                    node.inputs.denoise = patch.patchedPrompts.denoiseStrength
                }
                console.log(
                    `>> [AST_MUTATE] Patched sampler parameters on node '${nodeId}' (${classType}) [OK]`,
                )
            }

            // Patch CLIP Positive / Negative Prompts
            if (classType === 'CLIPTextEncode') {
                const title = node._meta?.title?.toLowerCase() || ''
                const currentText =
                    typeof node.inputs.text === 'string' ? node.inputs.text : ''

                if (
                    title.includes('negative') ||
                    currentText.includes('blurry') ||
                    currentText.includes('bad anatomy')
                ) {
                    node.inputs.text = patch.patchedPrompts.negativePrompt
                    console.log(
                        `>> [AST_MUTATE] Patched negative prompt on node '${nodeId}' [OK]`,
                    )
                } else {
                    node.inputs.text = patch.patchedPrompts.positivePrompt
                    console.log(
                        `>> [AST_MUTATE] Patched positive prompt on node '${nodeId}' [OK]`,
                    )
                }
            }
        }

        return mutated
    }

    /**
     * Orchestrates the complete patch lifecycle: triage evaluation, prompt synthesis, AST mutation.
     */
    public executePatchPipeline(
        candidate: CandidatePlate,
        gauntletResult: GauntletResult,
        currentJob: ExecutionJob,
        currentWorkflow?: ComfyWorkflow,
    ): PatchPipelineOutcome {
        // 1. Clean Pass
        if (gauntletResult.passed) {
            console.log(
                `>> [JULES_PATCH:PASS] Candidate '${candidate.candidateSha}' passed all gauntlet tiers [OK]`,
            )
            return {
                status: 'APPROVED',
                diagnostic: gauntletResult.diagnostic,
            }
        }

        // 2. Fatal Format Error (Tier 1)
        if (gauntletResult.terminalStage === 'TIER_1') {
            console.error(
                `>> [JULES_PATCH:FATAL] Candidate '${candidate.candidateSha}' failed format verification [FAIL]`,
            )
            return {
                status: 'FATAL_FORMAT_ERROR',
                diagnostic: gauntletResult.diagnostic,
            }
        }

        // 3. Circuit Breaker Divergence / Attempt Ceiling Trip
        const cb = gauntletResult.circuitBreaker
        if (
            cb &&
            (cb.status === 'CIRCUIT_BREAKER_TRIPPED' ||
                cb.status === 'DIVERGENT_STRUCTURAL_CONFLICT')
        ) {
            console.error(
                `>> [JULES_PATCH:HALT] Circuit breaker engaged (${cb.status}). Freezing retry loop [HALT]`,
            )
            return {
                status: 'HALTED_BLOCKED',
                dossier: cb.dossier,
                diagnostic: `Circuit breaker tripped. Status: ${cb.status}. Trajectory: ${cb.trajectory}`,
            }
        }

        // 4. Retry Permitted: Synthesize Prompts
        if (!gauntletResult.auditReport) {
            return {
                status: 'HALTED_BLOCKED',
                diagnostic: 'Missing VlmAuditReport for patch synthesis.',
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

        // Optionally apply patch directly to workflow AST if present
        let patchedWorkflow: ComfyWorkflow | undefined
        if (currentWorkflow) {
            patchedWorkflow = this.applyPatchToWorkflow(
                currentWorkflow,
                patchResult,
            )
        }

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
                workflowAst: patchedWorkflow || currentJob.prompts?.workflowAst,
            },
        }

        console.log(
            `>> [JULES_PATCH:RETRY] Task '${currentJob.taskId}' patched for Attempt ${nextAttempt}/${currentJob.maxAttempts} [OK]`,
        )

        return {
            status: 'RETRY_SCHEDULED',
            remediatedJob,
            diagnostic: `Patched via strategy '${patchResult.strategyApplied}'. ${patchResult.diffSummary}`,
        }
    }
}
