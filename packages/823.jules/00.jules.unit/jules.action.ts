import type { Action } from '../99.core/interface/action.interface.js'
import type JulesBit from './fce/jules.bit.js'

export const INIT_JULES = '[Jules action] Init Jules'
export class InitJules implements Action {
    readonly type = INIT_JULES
    constructor(public bale: JulesBit) {}
}

export const UPDATE_JULES = '[Jules action] Update Jules'
export class UpdateJules implements Action {
    readonly type = UPDATE_JULES
    constructor(public bale: JulesBit) {}
}

export const DISPATCH_JULES_TASK = '[Jules action] Dispatch Jules Task'
export class DispatchJulesTask implements Action {
    readonly type = DISPATCH_JULES_TASK
    constructor(public bale: JulesBit) {}
}

export const CHECK_JULES_STATUS = '[Jules action] Check Jules Status'
export class CheckJulesStatus implements Action {
    readonly type = CHECK_JULES_STATUS
    constructor(public bale: JulesBit) {}
}

export type Actions =
    InitJules | UpdateJules | DispatchJulesTask | CheckJulesStatus
