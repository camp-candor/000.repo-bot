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

export const TEST_HOTKEY = '[Test action] Test Hotkey'
export class TestHotkey implements Action {
    readonly type = TEST_HOTKEY
    constructor(public bale: HotkeyBit) {}
}

export const INTELLECT_HOTKEY = '[Intellect action] Intellect Hotkey'
export class IntellectHotkey implements Action {
    readonly type = INTELLECT_HOTKEY
    constructor(public bale: HotkeyBit) {}
}

export const VISION_HOTKEY = '[Vision action] Vision Hotkey'
export class VisionHotkey implements Action {
    readonly type = VISION_HOTKEY
    constructor(public bale: HotkeyBit) {}
}

export const LIST_HOTKEY = '[List action] List Hotkey'
export class ListHotkey implements Action {
    readonly type = LIST_HOTKEY
    constructor(public bale: HotkeyBit) {}
}

export type Actions =
    | InitHotkey
    | UpdateHotkey
    | ExecuteHotkey
    | TestHotkey
    | IntellectHotkey
    | VisionHotkey
    | ListHotkey
