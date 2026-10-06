
export type EventDomain = 'AUDIT' | 'GOVERNANCE' | 'FSM' | 'AGENT' | 'FLEET' | 'HARDWARE'

export type CanonicalEventType =
    | 'HEARTBEAT'
    | 'AUDIT_LOG'
    | 'PR_EVENT'
    | 'PUSH_EVENT'
    | 'MERGE_EVENT'
    | 'JULES_EVENT'
    | 'TASK_TRANSITION'
    | 'SLACK_RECEIPT'
    | 'COLD_DRAINAGE_FLUSH'
    | 'TELEMETRY_HISTORY'

export interface EventEnvelope<TType extends string = CanonicalEventType, TPayload = any> {
    readonly id: string
    readonly seq: number
    readonly tick: number
    readonly ts: number
    readonly version: number
    readonly domain: EventDomain
    readonly type: TType
    readonly source: string
    readonly correlationId: string
    readonly prevHash: string
    readonly recordHash: string
    readonly payload: TPayload
    readonly ascii: string
}

export const CURRENT_SCHEMA_VERSIONS: Record<string, number> = {
    HEARTBEAT: 1,
    AUDIT_LOG: 1,
    PR_EVENT: 1,
    PUSH_EVENT: 1,
    MERGE_EVENT: 1,
    JULES_EVENT: 1,
    TASK_TRANSITION: 1,
    SLACK_RECEIPT: 1,
    COLD_DRAINAGE_FLUSH: 1,
    TELEMETRY_HISTORY: 1,
}

/**
 * Sanitizes any string to pure 7-bit ASCII, stripping multi-byte UTF-8 sequences.
 */
export function sanitizeToAscii(str: string): string {
    return str.replace(/[^\x00-\x7F]/g, '').trim()
}

/**
 * Applies epistemic scrimming based on connection authority.
 * Public and unauthenticated viewers receive redacted summary projections.
 */
export function applyEpistemicScrimming(
    envelope: EventEnvelope,
    role: 'operator' | 'auditor' | 'public',
): EventEnvelope {
    if (role === 'operator' || role === 'auditor') {
        return envelope
    }

    return {
        ...envelope,
        payload: {
            summary: envelope.ascii,
            status: 'SCRIMMED_FOR_PUBLIC_VIEW',
        },
    }
}
