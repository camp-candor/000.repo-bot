
export type EventDomain = 'AUDIT' | 'GOVERNANCE' | 'FSM' | 'AGENT' | 'FLEET' | 'HARDWARE'

export type CanonicalEventType =
    | 'HEARTBEAT'
    | 'TELEMETRY_HISTORY'
    | 'AUDIT_LOG'
    | 'PR_EVENT'
    | 'PUSH_EVENT'
    | 'MERGE_EVENT'
    | 'JULES_EVENT'
    | 'TASK_TRANSITION'
    | 'SLACK_RECEIPT'
    | 'COLD_DRAINAGE_FLUSH'
    // Verification & Gate Failures
    | 'CHECK_FAILURE'
    | 'SCOPE_FIREWALL_BREACH'
    | 'TOCTOU_HEAD_DRIFT'
    | 'LINEAGE_ANOMALY'
    | 'BLAST_RADIUS_EXCEEDED'
    // FSM Circuit Breakers & Sagas
    | 'BUDGET_EXHAUSTED'
    | 'LEASE_HEARTBEAT_EXPIRED'
    | 'DEAD_LETTER_ENQUEUE'
    | 'SAGA_COMPENSATION_FAILURE'
    // Fleet Surveillance & Cross-Repo Drift
    | 'PIN_DRIFT_DETECTED'
    | 'CROSS_REPO_DESYNC'
    | 'EPHEMERAL_RESOURCE_ORPHANED'
    | 'VELOCITY_DORMANCY_BREACH'
    // Cryptographic Ledger & Drainage
    | 'HASH_CHAIN_CORRUPTION'
    | 'COLD_DRAINAGE_REJECTED'
    | 'HOT_BUFFER_SATURATION'
    // Human Governance & Interventions
    | 'DIRECTOR_OVERRIDE'
    | 'HUMAN_REJECTION_RECORDED'
    | 'KILL_SWITCH_ENGAGED'
    // Hardware Execution & Media Broker Ingress
    | 'BROKER_OOM_TRIP'
    | 'BROKER_HEARTBEAT_LOSS'
    | 'ARTIFACT_CHECKSUM_MISMATCH'

export interface EventEnvelope<TType extends CanonicalEventType = CanonicalEventType, TPayload = any> {
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


// ----------------------------------------------------------------------------
// :: DOMAIN SPECIFIC EVENT PAYLOAD CONTRACTS
// ----------------------------------------------------------------------------

export interface ScopeFirewallBreachPayload {
    readonly taskId: string
    readonly pullNumber: number
    readonly headSha: string
    readonly violationType:
        | 'PROTECTED_PATH_MUTATION'
        | 'DIRECTORY_TRAVERSAL'
        | 'SYMLINK_INJECTION'
        | 'RENAME_ORIGIN_PROTECTED'
        | 'UNLISTED_FILE_MUTATION'
    readonly offendingPaths: string[]
    readonly matchedPattern: string
}

export interface ToctouHeadDriftPayload {
    readonly taskId: string
    readonly pullNumber: number
    readonly expectedAuditedSha: string
    readonly actualRemoteSha: string
    readonly actor: string
    readonly driftedAt: number
    readonly actionTaken: 'MERGE_ABORTED_LOCK_FROZEN'
}

export interface LineageAnomalyPayload {
    readonly taskId: string
    readonly headSha: string
    readonly baseSha: string
    readonly comparisonStatus: string
    readonly reason: string
}

export interface BlastRadiusExceededPayload {
    readonly taskId: string
    readonly pullNumber: number
    readonly fileCount: number
    readonly ceilingLimit: number
}

export interface BudgetExhaustedPayload {
    readonly taskId: string
    readonly attemptsRun: number
    readonly maxAttempts: number
    readonly primaryFailureClass: string
    readonly terminalState: 'HALTED_FOR_TRIAGE'
}

export interface LeaseHeartbeatExpiredPayload {
    readonly taskId: string
    readonly lastHeartbeatTs: number
    readonly evictedAt: number
}

export interface DeadLetterEnqueuePayload {
    readonly taskId: string
    readonly entryReason: string
    readonly frozenContext: Record<string, unknown>
}

export interface CheckFailurePayload {
    readonly checkRunId: number
    readonly runName: string
    readonly repository: string
    readonly targetBranch: string
    readonly headSha: string
    readonly taskId: string
    readonly category: string
    readonly primaryError: string
    readonly logExcerpt: string
}

export interface HashChainCorruptionPayload {
    readonly repository: string
    readonly sequenceId: number
    readonly recordedHash: string
    readonly recomputedHash: string
    readonly prevHash: string
}

export interface DirectorOverridePayload {
    readonly target: string
    readonly property: string
    readonly from: unknown
    readonly to: unknown
    readonly actor: string
    readonly reason: string
}

export interface HumanRejectionRecordedPayload {
    readonly taskId: string
    readonly pullNumber: number
    readonly rejectedHeadSha: string
    readonly actor: string
    readonly notes: string
}

export const CURRENT_SCHEMA_VERSIONS: Record<CanonicalEventType, number> = {
    HEARTBEAT: 1,
    TELEMETRY_HISTORY: 1,
    AUDIT_LOG: 1,
    PR_EVENT: 1,
    PUSH_EVENT: 1,
    MERGE_EVENT: 1,
    JULES_EVENT: 1,
    TASK_TRANSITION: 1,
    SLACK_RECEIPT: 1,
    COLD_DRAINAGE_FLUSH: 1,
    CHECK_FAILURE: 1,
    SCOPE_FIREWALL_BREACH: 1,
    TOCTOU_HEAD_DRIFT: 1,
    LINEAGE_ANOMALY: 1,
    BLAST_RADIUS_EXCEEDED: 1,
    BUDGET_EXHAUSTED: 1,
    LEASE_HEARTBEAT_EXPIRED: 1,
    DEAD_LETTER_ENQUEUE: 1,
    SAGA_COMPENSATION_FAILURE: 1,
    PIN_DRIFT_DETECTED: 1,
    CROSS_REPO_DESYNC: 1,
    EPHEMERAL_RESOURCE_ORPHANED: 1,
    VELOCITY_DORMANCY_BREACH: 1,
    HASH_CHAIN_CORRUPTION: 1,
    COLD_DRAINAGE_REJECTED: 1,
    HOT_BUFFER_SATURATION: 1,
    DIRECTOR_OVERRIDE: 1,
    HUMAN_REJECTION_RECORDED: 1,
    KILL_SWITCH_ENGAGED: 1,
    BROKER_OOM_TRIP: 1,
    BROKER_HEARTBEAT_LOSS: 1,
    ARTIFACT_CHECKSUM_MISMATCH: 1,
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
