import { Action } from '../99.core/interface/action.interface.js'
import MenuBit from './fce/menu.bit.js'

export const INIT_MENU = '[Menu action] Init Menu'
export class InitMenu implements Action {
    readonly type = INIT_MENU
    constructor(public bale: MenuBit) {}
}

export const UPDATE_MENU = '[Menu action] Update Menu'
export class UpdateMenu implements Action {
    readonly type = UPDATE_MENU
    constructor(public bale: MenuBit) {}
}

export const TEST_MENU = '[Menu action] Test Menu'
export class TestMenu implements Action {
    readonly type = TEST_MENU
    constructor(public bale: MenuBit) {}
}

export const CLOSE_TERMINAL = '[Close action] Close Terminal'
export class CloseTerminal implements Action {
    readonly type = CLOSE_TERMINAL
    constructor(public bale: MenuBit) {}
}

export const SLACK_MENU = '[Menu action] Slack Menu'
export class SlackMenu implements Action {
    readonly type = SLACK_MENU
    constructor(public bale: MenuBit) {}
}

export const PRINT_MENU = '[Render action] Print Menu'
export class PrintMenu implements Action {
    readonly type = PRINT_MENU
    constructor(public bale: MenuBit) {}
}

export type Actions =
    InitMenu | UpdateMenu | TestMenu | CloseTerminal | SlackMenu | PrintMenu
