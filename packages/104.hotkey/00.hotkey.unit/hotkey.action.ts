import type { Action } from '../99.core/interface/action.interface.js'
import type HotkeyBit from './fce/hotkey.bit.js'

export const INIT_HOTKEY = '[Hotkey action] Init Hotkey'
export class InitHotkey implements Action {
    readonly type = INIT_HOTKEY
    constructor(public bale: HotkeyBit) {}
}

export const UPDATE_HOTKEY = '[Hotkey action] Update Hotkey'
export class UpdateHotkey implements Action {
    readonly type = UPDATE_HOTKEY
    constructor(public bale: HotkeyBit) {}
}

export const EXECUTE_HOTKEY = '[Hotkey action] Execute Hotkey'
export class ExecuteHotkey implements Action {
    readonly type = EXECUTE_HOTKEY
    constructor(public bale: HotkeyBit) {}
}

export type Actions = InitHotkey | UpdateHotkey | ExecuteHotkey
