import { describe, it, expect } from 'vitest'
import { parseVisualScanTrace } from '../../src/triage/visualScanTrace.js'
import {
    evaluateCircuitBreaker,
    type AuditCycleRecord,
} from '../../src/triage/circuitBreaker.js'
import {
    DriftGauntlet,
    type CandidatePlate,
} from '../../src/triage/driftGauntlet.js'

describe('The Four-Tier Drift Inspection Gauntlet (Phase 2)', () => {
    const validCandidate: CandidatePlate = {
        taskId: 'shot-042',
        candidateSha: 'sha_test_042',
        mimeType: 'image/png',
        width: 1024,
        height: 1024,
        sizeBytes: 1024 * 500,
        perceptualLpipsScore: 0.04,
    }

    it('TASK-2.1: Tier 1 fails candidates with invalid dimensions or unapproved MIME types', async () => {
        const gauntlet = new DriftGauntlet()

        const badDimensions = { ...validCandidate, width: 800, height: 600 }
        const res1 = await gauntlet.evaluate(badDimensions, [])
        expect(res1.passed).toBe(false)
        expect(res1.terminalStage).toBe('TIER_1')
        expect(res1.diagnostic).toContain('Dimension mismatch')

        const badFormat = { ...validCandidate, mimeType: 'image/jpeg' }
        const res2 = await gauntlet.evaluate(badFormat, [])
        expect(res2.passed).toBe(false)
        expect(res2.terminalStage).toBe('TIER_1')
        expect(res2.diagnostic).toContain('Invalid format')
    })

    it('TASK-2.1: Tier 2 auto-promotes plates below perceptual LPIPS pass ceiling', async () => {
        const gauntlet = new DriftGauntlet()
        const res = await gauntlet.evaluate(validCandidate, [])

        expect(res.passed).toBe(true)
        expect(res.terminalStage).toBe('TIER_2')
        expect(res.diagnostic).toContain('Sub-threshold perceptual drift')
    })

    it('TASK-2.2: Tier 3 parses <visual_scan_trace> attention tags and validates closed taxonomy', () => {
        const mockVlmOutput = `
<visual_scan_trace>
{
  "eyelineCoordinates": [[0.45, 0.32], [0.55, 0.31]],
  "mouthBoundingBox": { "xMin": 0.46, "yMin": 0.55, "xMax": 0.54, "yMax": 0.62 },
  "propContourBounds": [],
  "luminanceDelta": 0.02,
  "lineSharpnessScore": 0.88,
  "anachronismsDetected": []
}
</visual_scan_trace>

{
  "classification": "HARMLESS_FLOAT_NOISE",
  "rationale": "Minor CUDA kernel variance in background noise floor.",
  "remediationDirective": "None required."
}
        `

        const report = parseVisualScanTrace(mockVlmOutput)
        expect(report.classification).toBe('HARMLESS_FLOAT_NOISE')
        expect(report.scanTrace.eyelineCoordinates).toHaveLength(2)
        expect(report.scanTrace.lineSharpnessScore).toBe(0.88)
    })

    it('TASK-2.2: Tier 3 rejects VLM outputs lacking attention grounding or violating taxonomy', () => {
        const missingTrace = `
{
  "classification": "HARMLESS_FLOAT_NOISE",
  "rationale": "Missing trace tags"
}
        `
        expect(() => parseVisualScanTrace(missingTrace)).toThrow(
            /Missing mandatory <visual_scan_trace>/,
        )

        const invalidTaxonomy = `
<visual_scan_trace>
{
  "eyelineCoordinates": [[0.5, 0.5]],
  "mouthBoundingBox": { "xMin": 0.4, "yMin": 0.4, "xMax": 0.6, "yMax": 0.6 }
}
</visual_scan_trace>
{
  "classification": "UNREGISTERED_VIBE_CHECK",
  "rationale": "Taxonomy breach"
}
        `
        expect(() => parseVisualScanTrace(invalidTaxonomy)).toThrow(
            /VLM_TAXONOMY_BREACH/,
        )

        const outOfBounds = `
<visual_scan_trace>
{
  "eyelineCoordinates": [[1.25, -0.15]],
  "mouthBoundingBox": { "xMin": 0.4, "yMin": 0.4, "xMax": 0.6, "yMax": 0.6 }
}
</visual_scan_trace>
{
  "classification": "HARMLESS_FLOAT_NOISE",
  "rationale": "Out of bounds"
}
        `
        expect(() => parseVisualScanTrace(outOfBounds)).toThrow(
            /must be normalized scalars in \[0\.0, 1\.0\]/,
        )
    })

    it('TASK-2.3: Tier 4 allows retry on convergence within 3 attempts, then trips', () => {
        const history: AuditCycleRecord[] = [
            {
                attempt: 1,
                classification: 'LIGHTING_CURVE_SHIFT',
                errorTokens: ['gamma_shift'],
                timestampMs: 1000,
            },
            {
                attempt: 2,
                classification: 'LIGHTING_CURVE_SHIFT',
                errorTokens: ['gamma_shift'],
                timestampMs: 2000,
            },
        ]

        const evaluation = evaluateCircuitBreaker(
            'shot-042',
            'sha_abc',
            history,
            3,
        )
        expect(evaluation.status).toBe('ALLOW_CYCLE_RETRY')
        expect(evaluation.trajectory).toBe('CONVERGENCE')

        history.push({
            attempt: 3,
            classification: 'LIGHTING_CURVE_SHIFT',
            errorTokens: ['gamma_shift'],
            timestampMs: 3000,
        })

        const evaluationTripped = evaluateCircuitBreaker(
            'shot-042',
            'sha_abc',
            history,
            3,
        )
        expect(evaluationTripped.status).toBe('CIRCUIT_BREAKER_TRIPPED')
    })

    it('TASK-2.3: Tier 4 trips circuit breaker immediately on structural divergence', () => {
        const history: AuditCycleRecord[] = [
            {
                attempt: 1,
                classification: 'LIGHTING_CURVE_SHIFT',
                errorTokens: ['gamma_shift'],
                timestampMs: 1000,
            },
            {
                attempt: 2,
                classification: 'CANON_INVARIANT_BREACH',
                errorTokens: ['zipper_on_costume'],
                timestampMs: 2000,
            },
        ]

        const evaluation = evaluateCircuitBreaker(
            'shot-042',
            'sha_abc',
            history,
            3,
        )
        expect(evaluation.status).toBe('DIVERGENT_STRUCTURAL_CONFLICT')
        expect(evaluation.trajectory).toBe('DIVERGENCE')
        expect(evaluation.dossier).toBeDefined()
        expect(evaluation.dossier?.status).toBe('BLOCKED')
        expect(evaluation.dossier?.contradictionSummary).toContain(
            'Structural conflict detected',
        )
    })

    it('TASK-2.4: end-to-end gauntlet routes high drift candidate through Tier 3 and Tier 4', async () => {
        const gauntlet = new DriftGauntlet()
        const highDriftCandidate: CandidatePlate = {
            ...validCandidate,
            perceptualLpipsScore: 0.18, // Trips Tier 3
        }

        const vlmAnatomyFailure = `
<visual_scan_trace>
{
  "eyelineCoordinates": [[0.4, 0.4], [0.6, 0.4]],
  "mouthBoundingBox": { "xMin": 0.4, "yMin": 0.6, "xMax": 0.6, "yMax": 0.7 },
  "propContourBounds": [],
  "luminanceDelta": 0.05,
  "lineSharpnessScore": 0.65,
  "anachronismsDetected": ["melted_finger"]
}
</visual_scan_trace>
{
  "classification": "ANATOMICAL_COLLAPSE",
  "rationale": "Hand anatomy collapsed into 6 melted digits."
}
        `

        const res = await gauntlet.evaluate(
            highDriftCandidate,
            [],
            async () => vlmAnatomyFailure,
        )

        expect(res.passed).toBe(false)
        expect(res.terminalStage).toBe('TIER_4')
        expect(res.auditReport?.classification).toBe('ANATOMICAL_COLLAPSE')
        expect(res.circuitBreaker?.status).toBe('ALLOW_CYCLE_RETRY') // Cycle 1 -> retry
    })
})
