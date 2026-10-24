import type { Action } from '../99.core/interface/action.interface'
import type ActionBit from './fce/action.bit'

// Action actions

export const INIT_ACTION = '[Action action] Init Action'
export class InitAction implements Action {
    readonly type = INIT_ACTION
    constructor(public bale: ActionBit) {}
}

export const UPDATE_ACTION = '[Action action] Update Action'
export class UpdateAction implements Action {
    readonly type = UPDATE_ACTION
    constructor(public bale: ActionBit) {}
}

export type Actions = InitAction | UpdateAction
