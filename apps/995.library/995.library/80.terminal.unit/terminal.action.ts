import type { Action } from '../99.core/interface/action.interface'
import type TerminalBit from './fce/terminal.bit'

export const INIT_TERMINAL = '[Terminal action] Init Terminal'
export class InitTerminal implements Action<TerminalBit> {
    readonly type = INIT_TERMINAL
    constructor(public bale: TerminalBit) {}
}

export const UPDATE_TERMINAL = '[Terminal action] Update Terminal'
export class UpdateTerminal implements Action<TerminalBit> {
    readonly type = UPDATE_TERMINAL
    constructor(public bale: TerminalBit) {}
}

export const RUN_TERMINAL = '[Run action] Run Terminal'
export class RunTerminal implements Action<TerminalBit> {
    readonly type = RUN_TERMINAL
    constructor(public bale: TerminalBit) {}
}

export const EDIT_TERMINAL = '[Edit action] Edit Terminal'
export class EditTerminal implements Action<TerminalBit> {
    readonly type = EDIT_TERMINAL
    constructor(public bale: TerminalBit) {}
}

export const SUSPEND_TERMINAL = '[Suspend action] Suspend Terminal'
export class SuspendTerminal implements Action<TerminalBit> {
    readonly type = SUSPEND_TERMINAL
    constructor(public bale: TerminalBit) {}
}

export const RESUME_TERMINAL = '[Resume action] Resume Terminal'
export class ResumeTerminal implements Action<TerminalBit> {
    readonly type = RESUME_TERMINAL
    constructor(public bale: TerminalBit) {}
}

export const PRINT_TERMINAL = '[Print action] Print Terminal'
export class PrintTerminal implements Action<TerminalBit> {
    readonly type = PRINT_TERMINAL
    constructor(public bale: TerminalBit) {}
}

export const CLOSE_TERMINAL = '[Close action] Close Terminal'
export class CloseTerminal implements Action<TerminalBit> {
    readonly type = CLOSE_TERMINAL
    constructor(public bale: TerminalBit) {}
}

export const OPTION_TERMINAL = '[Option action] Option Terminal'
export class OptionTerminal implements Action<TerminalBit> {
    readonly type = OPTION_TERMINAL
    constructor(public bale: TerminalBit) {}
}

export const INPUT_TERMINAL = '[Input action] Input Terminal'
export class InputTerminal implements Action<TerminalBit> {
    readonly type = INPUT_TERMINAL
    constructor(public bale: TerminalBit) {}
}

export const LAYOUT_TERMINAL = '[Layout action] Layout Terminal'
export class LayoutTerminal implements Action<TerminalBit> {
    readonly type = LAYOUT_TERMINAL
    constructor(public bale: TerminalBit) {}
}

export const OPEN_TERMINAL = '[Layout action] Open Terminal'
export class OpenTerminal implements Action<TerminalBit> {
    readonly type = OPEN_TERMINAL
    constructor(public bale: TerminalBit) {}
}

export const CLEAR_TERMINAL = '[Layout action] Clear Terminal'
export class ClearTerminal implements Action<TerminalBit> {
    readonly type = CLEAR_TERMINAL
    constructor(public bale: TerminalBit) {}
}

export type Actions =
    | InitTerminal
    | UpdateTerminal
    | RunTerminal
    | EditTerminal
    | SuspendTerminal
    | ResumeTerminal
    | PrintTerminal
    | CloseTerminal
    | OptionTerminal
    | InputTerminal
    | LayoutTerminal
    | OpenTerminal
    | ClearTerminal
