import type { Action } from '../99.core/interface/action.interface'
import type UnitBit from './fce/unit.bit'

export const INIT_UNIT = '[Unit action] Init Unit'
export class InitUnit implements Action<UnitBit> {
    readonly type = INIT_UNIT
    constructor(public bale: UnitBit) {}
}

export const UPDATE_UNIT = '[Unit action] Update Unit'
export class UpdateUnit implements Action<UnitBit> {
    readonly type = UPDATE_UNIT
    constructor(public bale: UnitBit) {}
}

export const LIST_UNIT = '[List action] List Unit'
export class ListUnit implements Action<UnitBit> {
    readonly type = LIST_UNIT
    constructor(public bale: UnitBit) {}
}

export const CREATE_UNIT = '[Create action] Create Unit'
export class CreateUnit implements Action<UnitBit> {
    readonly type = CREATE_UNIT
    constructor(public bale: UnitBit) {}
}

export const TEST_UNIT = '[Test action] Test Unit'
export class TestUnit implements Action<UnitBit> {
    readonly type = TEST_UNIT
    constructor(public bale: UnitBit) {}
}

export const FLATTEN_UNIT = '[Flatten action] Flatten Unit'
export class FlattenUnit implements Action<UnitBit> {
    readonly type = FLATTEN_UNIT
    constructor(public bale: UnitBit) {}
}

export const CONTAIN_UNIT = '[Contain action] Contain Unit'
export class ContainUnit implements Action<UnitBit> {
    readonly type = CONTAIN_UNIT
    constructor(public bale: UnitBit) {}
}

export type Actions =
    | ContainUnit
    | InitUnit
    | UpdateUnit
    | ListUnit
    | CreateUnit
    | TestUnit
    | FlattenUnit
