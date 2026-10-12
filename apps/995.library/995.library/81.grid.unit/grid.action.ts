import type { Action } from '../99.core/interface/action.interface'
import type GridBit from './fce/grid.bit'

export const INIT_GRID = '[Grid action] Init Grid'
export class InitGrid implements Action<GridBit> {
    readonly type = INIT_GRID
    constructor(public bale: GridBit) {}
}

export const UPDATE_GRID = '[Grid action] Update Grid'
export class UpdateGrid implements Action<GridBit> {
    readonly type = UPDATE_GRID
    constructor(public bale: GridBit) {}
}

export type Actions = InitGrid | UpdateGrid
