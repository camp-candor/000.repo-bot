import { Action } from '../99.core/interface/action.interface.js'
import GithubBit from './fce/github.bit.js'

// github actions

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

export const TEST_GITHUB = '[Test action] Test Github'
export class TestGithub implements Action {
    readonly type = TEST_GITHUB
    constructor(public bale: GithubBit) {}
}

export const INTELLECT_GITHUB = '[Intellect action] Intellect Github'
export class IntellectGithub implements Action {
    readonly type = INTELLECT_GITHUB
    constructor(public bale: GithubBit) {}
}

export const VISION_GITHUB = '[Vision action] Vision Github'
export class VisionGithub implements Action {
    readonly type = VISION_GITHUB
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
    | TestGithub
    | IntellectGithub
    | VisionGithub
    | ListGithub
