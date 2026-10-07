import type {
    DriftClassification,
    VlmAuditReport,
} from '../triage/visualScanTrace.js'

export interface PromptPayload {
    positivePrompt: string
    negativePrompt: string
    denoiseStrength?: number
    seed?: number
    extraParameters?: Record<string, any>
}

export interface PromptPatchResult {
    patchedPrompts: PromptPayload
    strategyApplied: DriftClassification
    diffSummary: string
    tokensAdded: string[]
}

export const MAX_PROMPT_CHARACTERS = 1500

/**
 * Deduplicates comma-separated prompt tokens while preserving original casing and order.
 */
export function deduplicateTokens(commaSeparated: string): string {
    const tokens = commaSeparated
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0)
    const seen = new Set<string>()
    const deduplicated: string[] = []

    for (const token of tokens) {
        const normalized = token.toLowerCase()
        if (!seen.has(normalized)) {
            seen.add(normalized)
            deduplicated.push(token)
        }
    }

    return deduplicated.join(', ')
}

/**
 * Enforces maximum prompt character ceiling to prevent CLIP buffer overflow.
 */
export function enforceTokenCeiling(
    prompt: string,
    maxCharacters = MAX_PROMPT_CHARACTERS,
): string {
    if (prompt.length <= maxCharacters) {
        return prompt
    }

    const truncated = prompt.substring(0, maxCharacters)
    const lastComma = truncated.lastIndexOf(',')
    if (lastComma > 0) {
        return truncated.substring(0, lastComma).trim()
    }
    return truncated.trim()
}

/**
 * Synthesizes taxonomy-grounded prompt adjustments and negative constraint amplifications.
 */
export function synthesizeRemediatedPrompt(
    currentPrompts: PromptPayload,
    auditReport: VlmAuditReport,
    currentAttempt: number,
): PromptPatchResult {
    const classification = auditReport.classification
    let positive = currentPrompts.positivePrompt
    let negative = currentPrompts.negativePrompt
    let seed = currentPrompts.seed ?? 42
    let denoise = currentPrompts.denoiseStrength ?? 1.0
    const tokensAdded: string[] = []

    switch (classification) {
        case 'HARMLESS_FLOAT_NOISE': {
            seed = seed + 1013 * currentAttempt
            denoise = Math.max(0.2, denoise - 0.02)
            break
        }

        case 'LIGHTING_CURVE_SHIFT': {
            const lightingAnchors =
                'balanced key lighting, neutral cinematic contrast, studio photometric curve'
            const lightingNegatives =
                'blown out highlights, crushed shadows, harsh clipping, severe tint, uneven exposure'

            positive = `${positive}, ${lightingAnchors}`
            negative = `${negative}, ${lightingNegatives}`
            tokensAdded.push(lightingAnchors, lightingNegatives)
            break
        }

        case 'ANATOMICAL_COLLAPSE': {
            const anatomyAnchors =
                'anatomically correct human structure, symmetric facial features, fully formed hands and fingers'
            const anatomyNegatives =
                'bad anatomy, anatomical deformation, deformed limbs, missing limbs, extra fingers, fused digits, warped face, asymmetric eyes, mutated hands'

            positive = `${positive}, ${anatomyAnchors}`
            negative = `${negative}, ${anatomyNegatives}`
            tokensAdded.push(anatomyAnchors, anatomyNegatives)
            seed = seed + 7919 * currentAttempt
            break
        }

        case 'CANON_INVARIANT_BREACH': {
            const anachronisms = auditReport.scanTrace.anachronismsDetected
            let anachronismNegatives = ''

            if (anachronisms.length > 0) {
                anachronismNegatives = anachronisms
                    .map((item) => `${item}, modern ${item}`)
                    .join(', ')
                negative = `${negative}, ${anachronismNegatives}`
                tokensAdded.push(anachronismNegatives)
            }

            if (auditReport.remediationDirective) {
                positive = `${positive}, ${auditReport.remediationDirective}`
                tokensAdded.push(auditReport.remediationDirective)
            }
            break
        }
    }

    const cleanPositive = enforceTokenCeiling(deduplicateTokens(positive))
    const cleanNegative = enforceTokenCeiling(deduplicateTokens(negative))

    const diffSummary =
        tokensAdded.length > 0
            ? `Injected: ${tokensAdded.join(' | ')}`
            : `Seed perturbed to ${seed}, denoise adjusted to ${denoise}`

    console.log(
        `>> [SYNTHESIS:PATCH] Strategy '${classification}' applied for Attempt ${currentAttempt + 1}. ${diffSummary} [OK]`,
    )

    return {
        patchedPrompts: {
            positivePrompt: cleanPositive,
            negativePrompt: cleanNegative,
            seed,
            denoiseStrength: denoise,
            extraParameters: currentPrompts.extraParameters,
        },
        strategyApplied: classification,
        diffSummary,
        tokensAdded,
    }
}
