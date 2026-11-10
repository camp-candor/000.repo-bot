import { Action } from "../99.core/interface/action.interface.js";
import  DiffBit  from "./fce/diff.bit.js";

export const INIT_DIFF = "[Diff action] Init Diff";
export class InitDiff implements Action {
    readonly type = INIT_DIFF;
    constructor(public bale: DiffBit) {}
}

export const UPDATE_DIFF = "[Diff action] Update Diff";
export class UpdateDiff implements Action {
    readonly type = UPDATE_DIFF;
    constructor(public bale: DiffBit) {}
}

export const AUDIT_PULL_REQUEST_DIFF = "[Diff action] Audit Pull Request Diff";
export class AuditPullRequestDiff implements Action {
    readonly type = AUDIT_PULL_REQUEST_DIFF;
    constructor(public bale: DiffBit) {}
}

export const DIFF_AUDIT_PASSED = "[Diff action] Diff Audit Passed";
export class DiffAuditPassed implements Action {
    readonly type = DIFF_AUDIT_PASSED;
    constructor(public bale: DiffBit) {}
}

export const DIFF_AUDIT_REJECTED = "[Diff action] Diff Audit Rejected";
export class DiffAuditRejected implements Action {
    readonly type = DIFF_AUDIT_REJECTED;
    constructor(public bale: DiffBit) {}
}

export type Actions = InitDiff | UpdateDiff | AuditPullRequestDiff | DiffAuditPassed | DiffAuditRejected;
