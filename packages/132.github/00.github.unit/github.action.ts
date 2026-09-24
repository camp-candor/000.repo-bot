export const AUDIT_HASH_CHAIN_INTEGRITY =
    '[Github action] Audit Hash Chain Integrity'
export class AuditHashChainIntegrity implements Action {
    readonly type = AUDIT_HASH_CHAIN_INTEGRITY
    constructor(public bale: GithubBit) {}
}

export const INSPECT_D1_AUDIT_LOG = '[Github action] Inspect D1 Audit Log'
export class InspectD1AuditLog implements Action {
    readonly type = INSPECT_D1_AUDIT_LOG
    constructor(public bale: GithubBit) {}
}

export const TRIGGER_COLD_DRAINAGE = '[Github action] Trigger Cold Drainage'
export class TriggerColdDrainage implements Action {
    readonly type = TRIGGER_COLD_DRAINAGE
    constructor(public bale: GithubBit) {}
}

// Add to export type Actions = ...
