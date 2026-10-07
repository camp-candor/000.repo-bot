import { parseVisualScanTrace, type VlmAuditReport } from './visualScanTrace.js'
import {
    evaluateCircuitBreaker,
    type AuditCycleRecord,
    type CircuitBreakerEvaluation,
} from './circuitBreaker.js'

export interface CandidatePlate {
    taskId: string
    candidateSha: string
    mimeType: string
    width: number
    height: number
    sizeBytes: number
    perceptualLpipsScore: number
    rawBuffer?: ArrayBuffer
}

export interface GauntletSpec {
    expectedWidth: number
    expectedHeight: number
    maxSizeBytes: number
    lpipsPassCeiling: number
    lpipsAuditThreshold: number
}

export interface GauntletResult {
    passed: boolean
    terminalStage: 'TIER_1' | 'TIER_2' | 'TIER_3' | 'TIER_4'
    diagnostic: string
    auditReport?: VlmAuditReport
    circuitBreaker?: CircuitBreakerEvaluation
}

export const DEFAULT_GAUNTLET_SPEC: GauntletSpec = {
    expectedWidth: 1024,
    expectedHeight: 1024,
    maxSizeBytes: 5 * 1024 * 1024, // 5 MB ceiling
    lpipsPassCeiling: 0.05, // <= 0.05 clean pass
    lpipsAuditThreshold: 0.12, // > 0.12 requires Tier 3 VLM audit
}

/**
 * The Four-Tier Drift Inspection Gauntlet Orchestrator.
 */
export class DriftGauntlet {
    constructor(private spec: GauntletSpec = DEFAULT_GAUNTLET_SPEC) {}

    /**
     * Executes the cascading multi-tier verification gauntlet on candidate generations.
     */
    public async evaluate(
        candidate: CandidatePlate,
        history: AuditCycleRecord[],
        vlmExecutor?: () => Promise<string>,
    ): Promise<GauntletResult> {
        // TIER 1: Deterministic Pixel & Format Gate
        if (
            candidate.width !== this.spec.expectedWidth ||
            candidate.height !== this.spec.expectedHeight
        ) {
            return {
                passed: false,
                terminalStage: 'TIER_1',
                diagnostic: `>> [TIER1:FAIL] Dimension mismatch: got ${candidate.width}x${candidate.height}, expected ${this.spec.expectedWidth}x${this.spec.expectedHeight}`,
            }
        }

        if (candidate.sizeBytes > this.spec.maxSizeBytes) {
            return {
                passed: false,
                terminalStage: 'TIER_1',
                diagnostic: `>> [TIER1:FAIL] File size ${candidate.sizeBytes} exceeds ceiling ${this.spec.maxSizeBytes}`,
            }
        }

        if (
            candidate.mimeType !== 'image/png' &&
            candidate.mimeType !== 'image/webp'
        ) {
            return {
                passed: false,
                terminalStage: 'TIER_1',
                diagnostic: `>> [TIER1:FAIL] Invalid format '${candidate.mimeType}'. Must be PNG or WEBP.`,
            }
        }

        // TIER 2: Metric-Space & Geometric Entropy Gate
        if (candidate.perceptualLpipsScore <= this.spec.lpipsPassCeiling) {
            return {
                passed: true,
                terminalStage: 'TIER_2',
                diagnostic: `>> [TIER2:PASS] Sub-threshold perceptual drift (${candidate.perceptualLpipsScore} <= ${this.spec.lpipsPassCeiling}). Auto-promoted [OK]`,
            }
        }

        // If drift is between clean pass and audit threshold, pass with warning
        if (candidate.perceptualLpipsScore <= this.spec.lpipsAuditThreshold) {
            return {
                passed: true,
                terminalStage: 'TIER_2',
                diagnostic: `>> [TIER2:PASS] Tolerable variance (${candidate.perceptualLpipsScore} <= ${this.spec.lpipsAuditThreshold}) [OK]`,
            }
        }

        // Drift exceeds audit threshold (> 0.12) -> Advance to TIER 3
        console.warn(
            `>> [TIER2:DRIFT] LPIPS drift ${candidate.perceptualLpipsScore} > ${this.spec.lpipsAuditThreshold}. Escalating to Tier 3 VLM Audit [ESCALATE]`,
        )

        if (!vlmExecutor) {
            return {
                passed: false,
                terminalStage: 'TIER_3',
                diagnostic:
                    '>> [TIER3:FAIL] Tier 3 required but no VLM executor supplied.',
            }
        }

        // TIER 3: Jules Multimodal Semantic Auditing (<visual_scan_trace>)
        const vlmRawOutput = await vlmExecutor()
        const auditReport = parseVisualScanTrace(vlmRawOutput)

        // Harmless noise and minor lighting curves clear the gate
        if (
            auditReport.classification === 'HARMLESS_FLOAT_NOISE' ||
            auditReport.classification === 'LIGHTING_CURVE_SHIFT'
        ) {
            return {
                passed: true,
                terminalStage: 'TIER_3',
                diagnostic: `>> [TIER3:PASS] Cleared under acceptable drift classification '${auditReport.classification}' [OK]`,
                auditReport,
            }
        }

        // Anatomical collapse or canon invariant breach -> Advance to TIER 4 Circuit Breaker
        console.error(
            `>> [TIER3:REJECT] Candidate rejected under '${auditReport.classification}'. Engaging Tier 4 Circuit Breaker [FAIL]`,
        )

        const newRecord: AuditCycleRecord = {
            attempt: history.length + 1,
            classification: auditReport.classification,
            errorTokens:
                auditReport.scanTrace.anachronismsDetected.length > 0
                    ? auditReport.scanTrace.anachronismsDetected
                    : [auditReport.classification],
            timestampMs: Date.now(),
        }

        const updatedHistory = [...history, newRecord]

        // TIER 4: Canon Invariant & Continuity Circuit Breaker
        const cbEvaluation = evaluateCircuitBreaker(
            candidate.taskId,
            candidate.candidateSha,
            updatedHistory,
        )

        return {
            passed: false,
            terminalStage: 'TIER_4',
            diagnostic: `>> [TIER4:CIRCUIT_BREAKER] Status: ${cbEvaluation.status}, Trajectory: ${cbEvaluation.trajectory}`,
            auditReport,
            circuitBreaker: cbEvaluation,
        }
    }
}
