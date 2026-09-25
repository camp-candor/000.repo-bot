import { Action } from '../99.core/interface/action.interface'
import StorageBit from './fce/storage.bit'

// Storage actions

export const INIT_STORAGE = '[Storage action] Init Storage'
export class InitStorage implements Action {
    readonly type = INIT_STORAGE
    constructor(public bale: StorageBit) {}
}

export const UPDATE_STORAGE = '[Storage action] Update Storage'
export class UpdateStorage implements Action {
    readonly type = UPDATE_STORAGE
    constructor(public bale: StorageBit) {}
}

export type Actions = InitStorage | UpdateStorage
