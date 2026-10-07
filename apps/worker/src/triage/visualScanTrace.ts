export type DriftClassification =
    | 'HARMLESS_FLOAT_NOISE'
    | 'LIGHTING_CURVE_SHIFT'
    | 'ANATOMICAL_COLLAPSE'
    | 'CANON_INVARIANT_BREACH'

export interface BoundingBox {
    xMin: number
    yMin: number
    xMax: number
    yMax: number
    label?: string
}

export interface VisualScanTrace {
    eyelineCoordinates: Array<[number, number]>
    mouthBoundingBox: BoundingBox
    propContourBounds: BoundingBox[]
    luminanceDelta: number
    lineSharpnessScore: number
    anachronismsDetected: string[]
}

export interface VlmAuditReport {
    scanTrace: VisualScanTrace
    classification: DriftClassification
    rationale: string
    remediationDirective?: string
}

const CLASSIFICATION_VALUES: ReadonlySet<DriftClassification> = new Set([
    'HARMLESS_FLOAT_NOISE',
    'LIGHTING_CURVE_SHIFT',
    'ANATOMICAL_COLLAPSE',
    'CANON_INVARIANT_BREACH',
])

const SCAN_TRACE_REGEX = /<visual_scan_trace>([\s\S]*?)<\/visual_scan_trace>/i

/**
 * Parses coordinate-grounded visual attention traces and validates VLM classification.
 */
export function parseVisualScanTrace(vlmOutput: string): VlmAuditReport {
    const traceMatch = SCAN_TRACE_REGEX.exec(vlmOutput)
    if (!traceMatch) {
        throw new Error(
            'VLM_PARSE_ERROR: Missing mandatory <visual_scan_trace> tags in audit output.',
        )
    }

    let parsedTrace: any
    try {
        parsedTrace = JSON.parse(traceMatch[1].trim())
    } catch (err: any) {
        throw new Error(
            `VLM_PARSE_ERROR: Malformed JSON inside <visual_scan_trace>: ${err.message}`,
        )
    }

    // Validate coordinate boundaries [0.0, 1.0]
    if (
        !Array.isArray(parsedTrace.eyelineCoordinates) ||
        parsedTrace.eyelineCoordinates.length === 0
    ) {
        throw new Error(
            'VLM_PARSE_ERROR: eyelineCoordinates must be a non-empty array of [x, y] coordinates.',
        )
    }

    for (const [x, y] of parsedTrace.eyelineCoordinates) {
        if (
            typeof x !== 'number' ||
            typeof y !== 'number' ||
            x < 0 ||
            x > 1 ||
            y < 0 ||
            y > 1
        ) {
            throw new Error(
                `VLM_PARSE_ERROR: Coordinates [${x}, ${y}] must be normalized scalars in [0.0, 1.0].`,
            )
        }
    }

    const mouthBox = parsedTrace.mouthBoundingBox
    if (
        !mouthBox ||
        mouthBox.xMin < 0 ||
        mouthBox.xMax > 1 ||
        mouthBox.yMin < 0 ||
        mouthBox.yMax > 1
    ) {
        throw new Error(
            'VLM_PARSE_ERROR: mouthBoundingBox coordinates out of bounds.',
        )
    }

    // Locate companion JSON verdict outside or adjacent to scan trace
    const cleanedOutput = vlmOutput.replace(SCAN_TRACE_REGEX, '').trim()
    const jsonMatch = /{[\s\S]*}/.exec(cleanedOutput)
    if (!jsonMatch) {
        throw new Error(
            'VLM_PARSE_ERROR: Missing companion JSON diagnosis verdict in VLM output.',
        )
    }

    let verdictObj: any
    try {
        verdictObj = JSON.parse(jsonMatch[0])
    } catch (err: any) {
        throw new Error(
            `VLM_PARSE_ERROR: Malformed companion JSON verdict: ${err.message}`,
        )
    }

    const classification = verdictObj.classification as DriftClassification
    if (!CLASSIFICATION_VALUES.has(classification)) {
        throw new Error(
            `VLM_TAXONOMY_BREACH: Invalid classification '${classification}'. Must match closed taxonomy.`,
        )
    }

    return {
        scanTrace: {
            eyelineCoordinates: parsedTrace.eyelineCoordinates,
            mouthBoundingBox: mouthBox,
            propContourBounds: parsedTrace.propContourBounds || [],
            luminanceDelta: Number(parsedTrace.luminanceDelta || 0),
            lineSharpnessScore: Number(parsedTrace.lineSharpnessScore || 0),
            anachronismsDetected: Array.isArray(
                parsedTrace.anachronismsDetected,
            )
                ? parsedTrace.anachronismsDetected
                : [],
        },
        classification,
        rationale: verdictObj.rationale || 'No rationale provided.',
        remediationDirective: verdictObj.remediationDirective,
    }
}
