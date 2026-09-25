import { Action } from '../99.core/interface/action.interface.js'
import JulesBit from './fce/jules.bit.js'

// jules actions

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

export const TEST_JULES = '[Test action] Test Jules'
export class TestJules implements Action {
    readonly type = TEST_JULES
    constructor(public bale: JulesBit) {}
}

export const INTELLECT_JULES = '[Intellect action] Intellect Jules'
export class IntellectJules implements Action {
    readonly type = INTELLECT_JULES
    constructor(public bale: JulesBit) {}
}

export const VISION_JULES = '[Vision action] Vision Jules'
export class VisionJules implements Action {
    readonly type = VISION_JULES
    constructor(public bale: JulesBit) {}
}

export const LIST_JULES = '[List action] List Jules'
export class ListJules implements Action {
    readonly type = LIST_JULES
    constructor(public bale: JulesBit) {}
}

export type Actions =
    | InitJules
    | UpdateJules
    | TestJules
    | IntellectJules
    | VisionJules
    | ListJules
