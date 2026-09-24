import { Action } from '../99.core/interface/action.interface.js'
import GithubBit from './fce/github.bit.js'

export const INIT_GITHUB = '[Github action] Init Github'
export class InitGithub implements Action {
    readonly type = INIT_GITHUB
    constructor(public bale: GithubBit) {}
}

export const UPDATE_GITHUB = '[Github action] Update Github'
export class UpdateGithub implements Action {
    readonly type = UPDATE_GITHUB
    constructor(public bale: GithubBit) {}
}

export const FETCH_MERGE_CANDIDATES = '[Github action] Fetch Merge Candidates'
export class FetchMergeCandidates implements Action {
    readonly type = FETCH_MERGE_CANDIDATES
    constructor(public bale: GithubBit) {}
}

export const INSPECT_PR_CAS = '[Github action] Inspect PR CAS'
export class InspectPrCas implements Action {
    readonly type = INSPECT_PR_CAS
    constructor(public bale: GithubBit) {}
}

export const EXECUTE_MERGE = '[Github action] Execute Merge'
export class ExecuteMerge implements Action {
    readonly type = EXECUTE_MERGE
    constructor(public bale: GithubBit) {}
}

export const TRIGGER_TASK_ROLLBACK = '[Github action] Trigger Task Rollback'
export class TriggerTaskRollback implements Action {
    readonly type = TRIGGER_TASK_ROLLBACK
    constructor(public bale: GithubBit) {}
}

export const FETCH_RECENT_COMMITS = '[Github action] Fetch Recent Commits'
export class FetchRecentCommits implements Action {
    readonly type = FETCH_RECENT_COMMITS
    constructor(public bale: GithubBit) {}
}

export const PREVIEW_COMMIT_DETAILS = '[Github action] Preview Commit Details'
export class PreviewCommitDetails implements Action {
    readonly type = PREVIEW_COMMIT_DETAILS
    constructor(public bale: GithubBit) {}
}

export const EXECUTE_HARD_RESET = '[Github action] Execute Hard Reset'
export class ExecuteHardReset implements Action {
    readonly type = EXECUTE_HARD_RESET
    constructor(public bale: GithubBit) {}
}

export const REGISTER_WATCHED_REPO = '[Github action] Register Watched Repo'
export class RegisterWatchedRepo implements Action {
    readonly type = REGISTER_WATCHED_REPO
    constructor(public bale: GithubBit) {}
}

export const LIST_WATCHED_REPOS = '[Github action] List Watched Repos'
export class ListWatchedRepos implements Action {
    readonly type = LIST_WATCHED_REPOS
    constructor(public bale: GithubBit) {}
}

export const LIST_GITHUB = '[List action] List Github'
export class ListGithub implements Action {
    readonly type = LIST_GITHUB
    constructor(public bale: GithubBit) {}
}

export const AUDIT_GITHUB_TOKEN = '[Github action] Audit Github Token'
export class AuditGithubToken implements Action {
    readonly type = AUDIT_GITHUB_TOKEN
    constructor(public bale: GithubBit) {}
}

export const CHECK_SLACK_BRIDGE_STATUS =
    '[Github action] Check Slack Bridge Status'
export class CheckSlackBridgeStatus implements Action {
    readonly type = CHECK_SLACK_BRIDGE_STATUS
    constructor(public bale: GithubBit) {}
}

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

export type Actions =
    | InitGithub
    | UpdateGithub
    | FetchMergeCandidates
    | InspectPrCas
    | ExecuteMerge
    | TriggerTaskRollback
    | FetchRecentCommits
    | PreviewCommitDetails
    | ExecuteHardReset
    | RegisterWatchedRepo
    | ListWatchedRepos
    | AuditGithubToken
    | CheckSlackBridgeStatus
    | AuditHashChainIntegrity
    | InspectD1AuditLog
    | TriggerColdDrainage
    | ListGithub
