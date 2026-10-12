import type { Action } from '../99.core/interface/action.interface'
import type DataBit from './fce/data.bit'

// Data actions

export const INIT_DATA = '[Data action] Init Data'
export class InitData implements Action<DataBit> {
    readonly type = INIT_DATA
    constructor(public bale: DataBit) {}
}

export const UPDATE_DATA = '[Data action] Update Data'
export class UpdateData implements Action<DataBit> {
    readonly type = UPDATE_DATA
    constructor(public bale: DataBit) {}
}

export const FRAME_DATA = '[Frame action] Frame Data'
export class FrameData implements Action<DataBit> {
    readonly type = FRAME_DATA
    constructor(public bale: DataBit) {}
}

export const FLAT_DATA = '[Flat action] Flat Data'
export class FlatData implements Action<DataBit> {
    readonly type = FLAT_DATA
    constructor(public bale: DataBit) {}
}

export type Actions = InitData | UpdateData | FrameData | FlatData
