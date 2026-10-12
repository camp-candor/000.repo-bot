import type { Action } from '../99.core/interface/action.interface'
import type ChoiceBit from './fce/choice.bit'

export const INIT_CHOICE = '[Choice action] Init Choice'
export class InitChoice implements Action<ChoiceBit> {
    readonly type = INIT_CHOICE
    constructor(public bale: ChoiceBit) {}
}

export const UPDATE_CHOICE = '[Choice action] Update Choice'
export class UpdateChoice implements Action<ChoiceBit> {
    readonly type = UPDATE_CHOICE
    constructor(public bale: ChoiceBit) {}
}

export const OPEN_CHOICE = '[Open action] Open Choice'
export class OpenChoice implements Action<ChoiceBit> {
    readonly type = OPEN_CHOICE
    constructor(public bale: ChoiceBit) {}
}

export const KEY_CHOICE = '[Key action] Key Choice'
export class KeyChoice implements Action<ChoiceBit> {
    readonly type = KEY_CHOICE
    constructor(public bale: ChoiceBit) {}
}

export const TOWER_CHOICE = '[Tower action] Tower Choice'
export class TowerChoice implements Action<ChoiceBit> {
    readonly type = TOWER_CHOICE
    constructor(public bale: ChoiceBit) {}
}

export type Actions =
    InitChoice | UpdateChoice | OpenChoice | KeyChoice | TowerChoice
