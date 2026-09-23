import { Action } from '../99.core/interface/action.interface'
import RepoBit from './fce/repo.bit'

// Repo actions

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

export type Actions = InitRepo | UpdateRepo
