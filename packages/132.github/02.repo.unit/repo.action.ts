import { Action } from '../99.core/interface/action.interface.js'
import RepoBit from './fce/repo.bit.js'

export const INIT_REPO = '[Repo action] Init Repo'
export class InitRepo implements Action {
    readonly type = INIT_REPO
    constructor(public bale: RepoBit) {}
}

export const UPDATE_REPO = '[Repo action] Update Repo'
export class UpdateRepo implements Action {
    readonly type = UPDATE_REPO
    constructor(public bale: RepoBit) {}
}

export const WRITE_REPO = '[Repo action] Write Repo'
export class WriteRepo implements Action {
    readonly type = WRITE_REPO
    constructor(public bale: RepoBit) {}
}

export const LIST_REPO = '[List action] List Repo'
export class ListRepo implements Action {
    readonly type = LIST_REPO
    constructor(public bale: RepoBit) {}
}

export const DELETE_REPO = '[Repo action] Delete Repo'
export class DeleteRepo implements Action {
    readonly type = DELETE_REPO
    constructor(public bale: RepoBit) {}
}

export const READ_REPO = '[Repo action] Read Repo'
export class ReadRepo implements Action {
    readonly type = READ_REPO
    constructor(public bale: RepoBit) {}
}

export const HEALTH_REPO = '[Repo action] Health Repo'
export class HealthRepo implements Action {
    readonly type = HEALTH_REPO
    constructor(public bale: RepoBit) {}
}

export type Actions =
    | InitRepo
    | UpdateRepo
    | WriteRepo
    | ListRepo
    | DeleteRepo
    | ReadRepo
    | HealthRepo
