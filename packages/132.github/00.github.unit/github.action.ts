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

export const LIST_GITHUB = '[List action] List Github'
export class ListGithub implements Action {
    readonly type = LIST_GITHUB
    constructor(public bale: GithubBit) {}
}

export type Actions =
    | InitGithub
    | UpdateGithub
    | FetchMergeCandidates
    | InspectPrCas
    | ExecuteMerge
    | ListGithub
