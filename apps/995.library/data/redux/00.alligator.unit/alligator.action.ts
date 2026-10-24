import type { Action } from '../99.core/interface/action.interface'
import type AlligatorBit from './fce/alligator.bit'

// Alligator actions

export const INIT_ALLIGATOR = '[Alligator action] Init Alligator'
export class InitAlligator implements Action {
    readonly type = INIT_ALLIGATOR
    constructor(public bale: AlligatorBit) {}
}

export const UPDATE_ALLIGATOR = '[Alligator action] Update Alligator'
export class UpdateAlligator implements Action {
    readonly type = UPDATE_ALLIGATOR
    constructor(public bale: AlligatorBit) {}
}

export type Actions = InitAlligator | UpdateAlligator
