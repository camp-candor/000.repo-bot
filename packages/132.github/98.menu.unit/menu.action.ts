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

export const GITHUB_MENU = '[Menu action] GITHUB Menu'
export class GithubMenu implements Action {
    readonly type = GITHUB_MENU
    constructor(public bale: MenuBit) {}
}

export type Actions = InitMenu | UpdateMenu | GithubMenu
