import { describe, it, expect } from 'vitest'
import {
    deduplicateTokens,
    enforceTokenCeiling,
    synthesizeRemediatedPrompt,
    type PromptPayload,
} from '../../src/remediation/promptSynthesizer.js'
import {
    JulesPatchPipeline,
    type ComfyWorkflow,
} from '../../src/remediation/patchPipeline.js'
import type {
    CandidatePlate,
    GauntletResult,
} from '../../src/triage/driftGauntlet.js'
import type { ExecutionJob } from '../../src/queue/fairQueue.js'
import type { VlmAuditReport } from '../../src/triage/visualScanTrace.js'

describe('The Jules Patch Pipeline Battery (Phase 4)', () => {
    const sampleWorkflow: ComfyWorkflow = {
        '3': {
            class_type: 'KSampler',
            inputs: {
                seed: 42,
                steps: 25,
                cfg: 7.5,
                denoise: 1.0,
                model: ['4', 0],
                positive: ['6', 0],
                negative: ['7', 0],
                latent_image: ['5', 0],
            },
        },
        '4': {
            class_type: 'CheckpointLoaderSimple',
            inputs: {
                ckpt_name: 'v1-5-pruned-emaonly.safetensors',
            },
        },
        '5': {
            class_type: 'EmptyLatentImage',
            inputs: {
                width: 512,
                height: 512,
                batch_size: 1,
            },
        },
        '6': {
            class_type: 'CLIPTextEncode',
            _meta: { title: 'Positive Prompt' },
            inputs: {
                text: 'A wandering knight in forest',
                clip: ['4', 1],
            },
        },
        '7': {
            class_type: 'CLIPTextEncode',
            _meta: { title: 'Negative Prompt' },
            inputs: {
                text: 'blurry, low quality',
                clip: ['4', 1],
            },
        },
        '8': {
            class_type: 'VAEDecode',
            inputs: {
                samples: ['3', 0],
                vae: ['4', 2],
            },
        },
    }

    const basePrompts: PromptPayload = {
        positivePrompt: 'A wandering knight in forest',
        negativePrompt: 'blurry, low quality',
        seed: 42,
        denoiseStrength: 1.0,
    }

    const baseJob: ExecutionJob = {
        taskId: 'shot-patch-01',
        artistId: 'artist_alpha',
        idempotencyKey: 'idemp-patch-01',
        workflowTemplate: 'wan_knight.json',
        prompts: {
            positive: basePrompts.positivePrompt,
            negative: basePrompts.negativePrompt,
        },
        seeds: [42],
        enqueuedAt: 1000,
        attemptCount: 1,
        maxAttempts: 3,
    }

    const baseCandidate: CandidatePlate = {
        taskId: 'shot-patch-01',
        candidateSha: 'sha_test_patch',
        mimeType: 'image/png',
        width: 1024,
        height: 1024,
        sizeBytes: 450_000,
        perceptualLpipsScore: 0.19,
    }

    it('Invariant 1: ComfyUI AST topological invariance & graph link preservation', () => {
        const pipeline = new JulesPatchPipeline()
        const auditReport: VlmAuditReport = {
            scanTrace: {
                eyelineCoordinates: [[0.5, 0.5]],
                mouthBoundingBox: {
                    xMin: 0.4,
                    yMin: 0.5,
                    xMax: 0.6,
                    yMax: 0.6,
                },
                propContourBounds: [],
                luminanceDelta: 0.02,
                lineSharpnessScore: 0.8,
                anachronismsDetected: [],
            },
            classification: 'ANATOMICAL_COLLAPSE',
            rationale: 'Severe facial deformity and warped eyes.',
        }

        const patchResult = synthesizeRemediatedPrompt(
            basePrompts,
            auditReport,
            1,
        )
        const patchedWorkflow = pipeline.applyPatchToWorkflow(
            sampleWorkflow,
            patchResult,
        )

        // Assertion: KSampler node positive input remains strictly ['6', 0], and negative input remains ['7', 0]
        expect(patchedWorkflow['3'].inputs.positive).toEqual(['6', 0])
        expect(patchedWorkflow['3'].inputs.negative).toEqual(['7', 0])
        expect(patchedWorkflow['3'].inputs.model).toEqual(['4', 0])
        expect(patchedWorkflow['3'].inputs.latent_image).toEqual(['5', 0])

        // Assertion: KSampler node seed is updated to a perturbed integer != 42
        expect(patchedWorkflow['3'].inputs.seed).not.toBe(42)
        expect(patchedWorkflow['3'].inputs.seed).toBe(42 + 7919 * 1)

        // Assertion: CLIPTextEncode positive contains anatomical stabilization anchors, negative contains deformity exclusions
        expect(patchedWorkflow['6'].inputs.text).toContain(
            'anatomically correct human structure',
        )
        expect(patchedWorkflow['7'].inputs.text).toContain('bad anatomy')

        // Assertion: Zero node keys or link array references are dropped or renamed
        expect(Object.keys(patchedWorkflow)).toEqual([
            '3',
            '4',
            '5',
            '6',
            '7',
            '8',
        ])
        expect(patchedWorkflow['8'].class_type).toBe('VAEDecode')
        expect(patchedWorkflow['8'].inputs.samples).toEqual(['3', 0])
        expect(patchedWorkflow['8'].inputs.vae).toEqual(['4', 2])
    })

    it('Invariant 2: Negative prompt token deduplication precision with case-insensitivity', () => {
        const dirty =
            'bad anatomy, deformed fingers, Bad Anatomy, DEFORMED FINGERS, mutated hand'
        const clean = deduplicateTokens(dirty)
        // Assertion: Evaluates to 'bad anatomy, deformed fingers, mutated hand'
        expect(clean).toBe('bad anatomy, deformed fingers, mutated hand')
        // Assertion: Order of first occurrence preserved
        expect(clean.split(', ')[0]).toBe('bad anatomy')
        expect(clean.split(', ')[1]).toBe('deformed fingers')
        expect(clean.split(', ')[2]).toBe('mutated hand')
    })

    it('Invariant 3: Comma-boundary token ceiling truncation (<= 1500 chars)', () => {
        // Generate synthetic prompt > 1500 characters
        const syntheticTokens: string[] = []
        for (let i = 1; i <= 150; i++) {
            syntheticTokens.push(`detailed cinematic token ${i}`)
        }
        const longPrompt = syntheticTokens.join(', ')
        expect(longPrompt.length).toBeGreaterThan(1500)

        const truncated = enforceTokenCeiling(longPrompt)

        // Assertion: Output length is <= 1500 characters
        expect(truncated.length).toBeLessThanOrEqual(1500)
        // Assertion: Terminates cleanly at complete token boundary (no trailing commas or partial tokens)
        expect(truncated.endsWith(',')).toBe(false)
        expect(truncated.endsWith(' ')).toBe(false)
        const tokens = truncated.split(', ')
        const lastToken = tokens[tokens.length - 1]
        expect(lastToken.startsWith('detailed cinematic token')).toBe(true)
    })

    it('Invariant 4: Cycle 1 convergence basin re-enqueue (N -> N+1)', () => {
        const pipeline = new JulesPatchPipeline()
        const gauntletResult: GauntletResult = {
            passed: false,
            terminalStage: 'TIER_4',
            diagnostic: 'Convergence retry allowed',
            auditReport: {
                scanTrace: {
                    eyelineCoordinates: [[0.5, 0.5]],
                    mouthBoundingBox: {
                        xMin: 0.4,
                        yMin: 0.5,
                        xMax: 0.6,
                        yMax: 0.6,
                    },
                    propContourBounds: [],
                    luminanceDelta: 0.05,
                    lineSharpnessScore: 0.8,
                    anachronismsDetected: [],
                },
                classification: 'LIGHTING_CURVE_SHIFT',
                rationale: 'Harsh shadow clipping.',
            },
            circuitBreaker: {
                status: 'ALLOW_CYCLE_RETRY',
                trajectory: 'CONVERGENCE',
                attempt: 1,
            },
        }

        const outcome = pipeline.executePatchPipeline(
            baseCandidate,
            gauntletResult,
            baseJob,
            sampleWorkflow,
        )

        // Assertions
        expect(outcome.status).toBe('RETRY_SCHEDULED')
        expect(outcome.remediatedJob?.attemptCount).toBe(2)
        expect(outcome.remediatedJob?.prompts?.positive).toContain(
            'balanced key lighting',
        )
        expect(outcome.remediatedJob?.prompts?.negative).toContain(
            'blown out highlights',
        )
    })

    it('Invariant 5: Cycle 2 structural divergence immediate trip', () => {
        const pipeline = new JulesPatchPipeline()
        const cycleTwoJob: ExecutionJob = { ...baseJob, attemptCount: 2 }

        const gauntletResult: GauntletResult = {
            passed: false,
            terminalStage: 'TIER_4',
            diagnostic: 'Divergent error categories',
            circuitBreaker: {
                status: 'DIVERGENT_STRUCTURAL_CONFLICT',
                trajectory: 'DIVERGENCE',
                attempt: 2,
                dossier: {
                    taskId: 'shot-patch-01',
                    candidateSha: 'sha_test_patch',
                    exhaustedAttempts: 2,
                    trajectory: 'DIVERGENCE',
                    status: 'BLOCKED',
                    history: [],
                    contradictionSummary:
                        'Divergence from lighting to canon breach',
                    generatedAtIso: new Date().toISOString(),
                },
            },
        }

        const outcome = pipeline.executePatchPipeline(
            baseCandidate,
            gauntletResult,
            cycleTwoJob,
        )

        // Assertions
        expect(outcome.status).toBe('HALTED_BLOCKED')
        expect(outcome.dossier?.trajectory).toBe('DIVERGENCE')
        expect(outcome.remediatedJob).toBeUndefined()
    })

    it('Invariant 6: Cycle 3 exhaustion ceiling and dossier generation', () => {
        const pipeline = new JulesPatchPipeline()
        const cycleThreeJob: ExecutionJob = { ...baseJob, attemptCount: 3 }

        const gauntletResult: GauntletResult = {
            passed: false,
            terminalStage: 'TIER_4',
            diagnostic: 'Max attempts exhausted',
            circuitBreaker: {
                status: 'CIRCUIT_BREAKER_TRIPPED',
                trajectory: 'CONVERGENCE',
                attempt: 3,
                dossier: {
                    taskId: 'shot-patch-01',
                    candidateSha: 'sha_test_patch',
                    exhaustedAttempts: 3,
                    trajectory: 'CONVERGENCE',
                    status: 'BLOCKED',
                    history: [],
                    contradictionSummary: 'Exhausted 3 attempts',
                    generatedAtIso: new Date().toISOString(),
                },
            },
        }

        const outcome = pipeline.executePatchPipeline(
            baseCandidate,
            gauntletResult,
            cycleThreeJob,
        )

        // Assertions
        expect(outcome.status).toBe('HALTED_BLOCKED')
        expect(outcome.dossier?.status).toBe('BLOCKED')
        expect(outcome.dossier?.exhaustedAttempts).toBe(3)
        expect(outcome.remediatedJob).toBeUndefined()
    })
})
