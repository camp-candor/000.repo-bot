import type { Action } from '../99.core/interface/action.interface'
import type PivotBit from './fce/pivot.bit'

// Pivot actions

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

export type Actions = InitPivot | UpdatePivot
