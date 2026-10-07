import { describe, it, expect } from 'vitest'
import {
    deduplicateTokens,
    enforceTokenCeiling,
    synthesizeRemediatedPrompt,
    type PromptPayload,
} from '../../src/remediation/promptSynthesizer.js'
import { RemediationEngine } from '../../src/remediation/remediationEngine.js'
import type {
    CandidatePlate,
    GauntletResult,
} from '../../src/triage/driftGauntlet.js'
import type { ExecutionJob } from '../../src/queue/fairQueue.js'
import type { VlmAuditReport } from '../../src/triage/visualScanTrace.js'

describe('Autonomous Jules Remediation Battery (Phase 4)', () => {
    const basePrompts: PromptPayload = {
        positivePrompt:
            'A medieval knight standing in a stone courtyard, cinematic',
        negativePrompt: 'blurry, low quality',
        seed: 42,
        denoiseStrength: 1.0,
    }

    const baseJob: ExecutionJob = {
        taskId: 'shot-rem-01',
        artistId: 'artist_alpha',
        idempotencyKey: 'idemp_rem_01',
        workflowTemplate: 'wan_t2v.json',
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
        taskId: 'shot-rem-01',
        candidateSha: 'sha_candidate_999',
        mimeType: 'image/png',
        width: 1024,
        height: 1024,
        sizeBytes: 400_000,
        perceptualLpipsScore: 0.18,
    }

    it('TASK-4.1: deduplicateTokens removes duplicate negative prompt tokens cleanly', () => {
        const dirtyTokens =
            'bad anatomy, deformed limbs, bad anatomy, extra fingers, BAD ANATOMY, warped face'
        const clean = deduplicateTokens(dirtyTokens)

        expect(clean).toBe(
            'bad anatomy, deformed limbs, extra fingers, warped face',
        )
    })

    it('TASK-4.1: enforceTokenCeiling truncates safely at comma boundaries', () => {
        const longPrompt =
            'token1, token2, token3, token4, token5, token6, token7'
        const truncated = enforceTokenCeiling(longPrompt, 30)

        expect(truncated.length).toBeLessThanOrEqual(30)
        expect(truncated).toBe('token1, token2, token3')
    })

    it('TASK-4.1: synthesizes prompt for ANATOMICAL_COLLAPSE with negative anchors and seed jump', () => {
        const auditReport: VlmAuditReport = {
            scanTrace: {
                eyelineCoordinates: [[0.4, 0.4]],
                mouthBoundingBox: {
                    xMin: 0.4,
                    yMin: 0.6,
                    xMax: 0.6,
                    yMax: 0.7,
                },
                propContourBounds: [],
                luminanceDelta: 0.01,
                lineSharpnessScore: 0.7,
                anachronismsDetected: [],
            },
            classification: 'ANATOMICAL_COLLAPSE',
            rationale: 'Left hand melted into 6 digits.',
        }

        const result = synthesizeRemediatedPrompt(basePrompts, auditReport, 1)

        expect(result.strategyApplied).toBe('ANATOMICAL_COLLAPSE')
        expect(result.patchedPrompts.positivePrompt).toContain(
            'anatomically correct human structure',
        )
        expect(result.patchedPrompts.negativePrompt).toContain('deformed limbs')
        expect(result.patchedPrompts.negativePrompt).toContain('extra fingers')
        expect(result.patchedPrompts.seed).not.toBe(42) // Seed jumped
    })

    it('TASK-4.1: converts detected anachronisms into explicit negative exclusions for CANON_INVARIANT_BREACH', () => {
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
                lineSharpnessScore: 0.85,
                anachronismsDetected: ['zipper', 'wrist_watch'],
            },
            classification: 'CANON_INVARIANT_BREACH',
            rationale: 'Modern zipper visible on medieval tunic.',
            remediationDirective: 'accurate period-accurate lace fastenings',
        }

        const result = synthesizeRemediatedPrompt(basePrompts, auditReport, 1)

        expect(result.strategyApplied).toBe('CANON_INVARIANT_BREACH')
        expect(result.patchedPrompts.negativePrompt).toContain('zipper')
        expect(result.patchedPrompts.negativePrompt).toContain('wrist_watch')
        expect(result.patchedPrompts.positivePrompt).toContain(
            'accurate period-accurate lace fastenings',
        )
    })

    it('TASK-4.2: RemediationEngine schedules retry on Cycle 1 convergence', () => {
        const engine = new RemediationEngine()
        const gauntletResult: GauntletResult = {
            passed: false,
            terminalStage: 'TIER_4',
            diagnostic: 'Convergence retry permitted',
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
                rationale: 'Severe gamma drop in shadowed regions.',
            },
            circuitBreaker: {
                status: 'ALLOW_CYCLE_RETRY',
                trajectory: 'CONVERGENCE',
                attempt: 1,
            },
        }

        const outcome = engine.evaluateAndRemediate(
            baseCandidate,
            gauntletResult,
            baseJob,
        )

        expect(outcome.status).toBe('RETRY_SCHEDULED')
        expect(outcome.remediatedJob).toBeDefined()
        expect(outcome.remediatedJob?.attemptCount).toBe(2)
        expect(outcome.remediatedJob?.prompts?.positive).toContain(
            'balanced key lighting',
        )
    })

    it('TASK-4.2: RemediationEngine trips circuit breaker and halts when attempts are exhausted (Attempt 3)', () => {
        const engine = new RemediationEngine()
        const exhaustedJob: ExecutionJob = { ...baseJob, attemptCount: 3 }

        const gauntletResult: GauntletResult = {
            passed: false,
            terminalStage: 'TIER_4',
            diagnostic: 'Max attempts reached',
            circuitBreaker: {
                status: 'CIRCUIT_BREAKER_TRIPPED',
                trajectory: 'CONVERGENCE',
                attempt: 3,
                dossier: {
                    taskId: 'shot-rem-01',
                    candidateSha: 'sha_candidate_999',
                    exhaustedAttempts: 3,
                    trajectory: 'CONVERGENCE',
                    status: 'BLOCKED',
                    history: [],
                    contradictionSummary:
                        'Max attempts exhausted across 3 cycles',
                    generatedAtIso: new Date().toISOString(),
                },
            },
        }

        const outcome = engine.evaluateAndRemediate(
            baseCandidate,
            gauntletResult,
            exhaustedJob,
        )

        expect(outcome.status).toBe('HALTED_BLOCKED')
        expect(outcome.dossier).toBeDefined()
        expect(outcome.dossier?.status).toBe('BLOCKED')
        expect(outcome.remediatedJob).toBeUndefined() // Zero re-enqueue
    })

    it('TASK-4.2: RemediationEngine halts immediately upon DIVERGENT_STRUCTURAL_CONFLICT at Cycle 2', () => {
        const engine = new RemediationEngine()
        const cycleTwoJob: ExecutionJob = { ...baseJob, attemptCount: 2 }

        const gauntletResult: GauntletResult = {
            passed: false,
            terminalStage: 'TIER_4',
            diagnostic: 'Cross-category divergence',
            circuitBreaker: {
                status: 'DIVERGENT_STRUCTURAL_CONFLICT',
                trajectory: 'DIVERGENCE',
                attempt: 2,
                dossier: {
                    taskId: 'shot-rem-01',
                    candidateSha: 'sha_candidate_999',
                    exhaustedAttempts: 2,
                    trajectory: 'DIVERGENCE',
                    status: 'BLOCKED',
                    history: [],
                    contradictionSummary:
                        'Structural divergence: lighting shifted to canon breach',
                    generatedAtIso: new Date().toISOString(),
                },
            },
        }

        const outcome = engine.evaluateAndRemediate(
            baseCandidate,
            gauntletResult,
            cycleTwoJob,
        )

        expect(outcome.status).toBe('HALTED_BLOCKED')
        expect(outcome.dossier?.trajectory).toBe('DIVERGENCE')
        expect(outcome.remediatedJob).toBeUndefined()
    })
})
