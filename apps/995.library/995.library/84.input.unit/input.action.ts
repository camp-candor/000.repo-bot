import type { Action } from '../99.core/interface/action.interface'
import type InputBit from './fce/input.bit'

export const INIT_INPUT = '[Input action] Init Input'
export class InitInput implements Action<InputBit> {
    readonly type = INIT_INPUT
    constructor(public bale: InputBit) {}
}

export const UPDATE_INPUT = '[Input action] Update Input'
export class UpdateInput implements Action<InputBit> {
    readonly type = UPDATE_INPUT
    constructor(public bale: InputBit) {}
}

export const OPEN_INPUT = '[Open action] Open Input'
export class OpenInput implements Action<InputBit> {
    readonly type = OPEN_INPUT
    constructor(public bale: InputBit) {}
}

export type Actions = InitInput | UpdateInput | OpenInput
