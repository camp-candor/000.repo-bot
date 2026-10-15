import { Action } from '../99.core/interface/action.interface.js'
import PivotBit from './fce/pivot.bit.js'

// pivot actions

export const INIT_PIVOT = '[Pivot action] Init Pivot'
export class InitPivot implements Action {
    readonly type = INIT_PIVOT
    constructor(public bale: PivotBit) {}
}

export const UPDATE_PIVOT = '[Pivot action] Update Pivot'
export class UpdatePivot implements Action {
    readonly type = UPDATE_PIVOT
    constructor(public bale: PivotBit) {}
}

export const TEST_PIVOT = '[Test action] Test Pivot'
export class TestPivot implements Action {
    readonly type = TEST_PIVOT
    constructor(public bale: PivotBit) {}
}

export const INTELLECT_PIVOT = '[Intellect action] Intellect Pivot'
export class IntellectPivot implements Action {
    readonly type = INTELLECT_PIVOT
    constructor(public bale: PivotBit) {}
}

export const VISION_PIVOT = '[Vision action] Vision Pivot'
export class VisionPivot implements Action {
    readonly type = VISION_PIVOT
    constructor(public bale: PivotBit) {}
}

export const LIST_PIVOT = '[List action] List Pivot'
export class ListPivot implements Action {
    readonly type = LIST_PIVOT
    constructor(public bale: PivotBit) {}
}

export type Actions =
    | InitPivot
    | UpdatePivot
    | TestPivot
    | IntellectPivot
    | VisionPivot
    | ListPivot
