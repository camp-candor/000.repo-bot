import {
    normalizePath,
    isProtectedPath,
    type GitHubPullRequestFile,
} from './prAuditEngine.js'

export type RiskClass =
    'CLASS_0_FORBIDDEN' | 'CLASS_1_HIGH_RISK' | 'CLASS_2_LOW_RISK'

export interface FileRiskClassification {
    filename: string
    riskClass: RiskClass
    matchedPattern?: string
    hasLockedPragma: boolean
    hasGeneratedPragma: boolean
}

export interface DiffRiskResult {
    isHighRiskPath: boolean
    dominantClass: RiskClass
    fileCount: number
    files: FileRiskClassification[]
}

// ----------------------------------------------------------------------------
// :: ANCHORED PATH SENSITIVITY PATTERNS
// ----------------------------------------------------------------------------

export const HIGH_RISK_PATTERNS: RegExp[] = [
    /^characters\/.*\.md$/i,
    /^world\/.*\.md$/i,
    /^grievances\/.*\.md$/i,
    /^scenes\/.*\.json$/i,
    /^Dockerfile$/i,
    /^requirements\.txt$/i,
]

export const LOW_RISK_PATTERNS: RegExp[] = [
    /^src\/utils\/.*$/i,
    /^src\/types\/.*$/i,
    /^compiled\/.*\.json$/i,
]

/**
 * Checks for sealed lifecycle pragmas in file content or patch headers.
 */
export function inspectLifecyclePragmas(contentOrPatch?: string | null): {
    isLocked: boolean
    isGenerated: boolean
} {
    if (!contentOrPatch) {
        return { isLocked: false, isGenerated: false }
    }
    const isLocked = /@lifecycle:\s*locked/i.test(contentOrPatch)
    const isGenerated = /@lifecycle:\s*generated/i.test(contentOrPatch)
    return { isLocked, isGenerated }
}

/**
 * Classifies a single file path and optional patch content into a RiskClass.
 */
export function classifyFileRisk(
    filePath: string,
    previousPath?: string | null,
    patchOrContent?: string | null,
): FileRiskClassification {
    const currentNorm = normalizePath(filePath)
    const previousNorm = previousPath ? normalizePath(previousPath) : null

    // 1. Class 0: Forbidden takes absolute precedence
    if (
        isProtectedPath(currentNorm) ||
        (previousNorm && isProtectedPath(previousNorm))
    ) {
        return {
            filename: currentNorm,
            riskClass: 'CLASS_0_FORBIDDEN',
            matchedPattern: 'PROTECTED_PATTERN',
            hasLockedPragma: false,
            hasGeneratedPragma: false,
        }
    }

    // 2. Check lifecycle pragmas
    const { isLocked, isGenerated } = inspectLifecyclePragmas(patchOrContent)
    if (isLocked) {
        return {
            filename: currentNorm,
            riskClass: 'CLASS_1_HIGH_RISK',
            matchedPattern: '@lifecycle: locked',
            hasLockedPragma: true,
            hasGeneratedPragma: false,
        }
    }

    // 3. Class 1: High-Risk / Creative Path Regex Evaluation
    for (const pattern of HIGH_RISK_PATTERNS) {
        if (
            pattern.test(currentNorm) ||
            (previousNorm && pattern.test(previousNorm))
        ) {
            return {
                filename: currentNorm,
                riskClass: 'CLASS_1_HIGH_RISK',
                matchedPattern: pattern.toString(),
                hasLockedPragma: isLocked,
                hasGeneratedPragma: isGenerated,
            }
        }
    }

    // 4. Class 2: Low-Risk / Deterministic Path Evaluation
    for (const pattern of LOW_RISK_PATTERNS) {
        if (pattern.test(currentNorm)) {
            return {
                filename: currentNorm,
                riskClass: 'CLASS_2_LOW_RISK',
                matchedPattern: pattern.toString(),
                hasLockedPragma: false,
                hasGeneratedPragma: isGenerated,
            }
        }
    }

    // Fallback: If generated pragma is present on unclassified path, treat as Class 2
    if (isGenerated) {
        return {
            filename: currentNorm,
            riskClass: 'CLASS_2_LOW_RISK',
            matchedPattern: '@lifecycle: generated',
            hasLockedPragma: false,
            hasGeneratedPragma: true,
        }
    }

    // Default policy: Any unrecognized, unclassified application path fails high to High-Risk
    return {
        filename: currentNorm,
        riskClass: 'CLASS_1_HIGH_RISK',
        matchedPattern: 'UNCLASSIFIED_FAIL_HIGH',
        hasLockedPragma: false,
        hasGeneratedPragma: false,
    }
}

/**
 * Evaluates an entire PR diff using the Fail-High Join rule.
 */
export function classifyDiffRisk(
    files: (GitHubPullRequestFile & { patch?: string })[],
): DiffRiskResult {
    const classifications = files.map((f) =>
        classifyFileRisk(f.filename, f.previous_filename, f.patch),
    )

    let hasForbidden = false
    let hasHighRisk = false

    for (const item of classifications) {
        if (item.riskClass === 'CLASS_0_FORBIDDEN') hasForbidden = true
        if (item.riskClass === 'CLASS_1_HIGH_RISK') hasHighRisk = true
    }

    const isHighRiskPath = hasForbidden || hasHighRisk
    const dominantClass: RiskClass = hasForbidden
        ? 'CLASS_0_FORBIDDEN'
        : hasHighRisk
          ? 'CLASS_1_HIGH_RISK'
          : 'CLASS_2_LOW_RISK'

    return {
        isHighRiskPath,
        dominantClass,
        fileCount: files.length,
        files: classifications,
    }
}
