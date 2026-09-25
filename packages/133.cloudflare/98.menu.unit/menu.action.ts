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

export const DEPLOYMENT_MENU = '[Menu action] Deployment Menu'
export class DeploymentMenu implements Action {
    readonly type = DEPLOYMENT_MENU
    constructor(public bale: MenuBit) {}
}

export type Actions = InitMenu | UpdateMenu | DeploymentMenu
