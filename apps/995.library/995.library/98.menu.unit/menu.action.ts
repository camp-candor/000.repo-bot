import type { Action } from '../99.core/interface/action.interface'
import type MenuBit from './fce/menu.bit'

export const INIT_MENU = '[Menu action] Init Menu'
export class InitMenu implements Action<MenuBit> {
    readonly type = INIT_MENU
    constructor(public bale: MenuBit) {}
}

export const OPEN_MENU = '[Menu action] Open Menu'
export class OpenMenu implements Action<MenuBit> {
    readonly type = OPEN_MENU
    constructor(public bale: MenuBit) {}
}

export const UPDATE_MENU = '[Menu action] Update Menu'
export class UpdateMenu implements Action<MenuBit> {
    readonly type = UPDATE_MENU
    constructor(public bale: MenuBit) {}
}

export const CLOSE_MENU = '[Menu action] Close Menu'
export class CloseMenu implements Action<MenuBit> {
    readonly type = CLOSE_MENU
    constructor(public bale: MenuBit) {}
}

export const LIBRARY_MENU = '[Menu action] Library Menu'
export class LibraryMenu implements Action<MenuBit> {
    readonly type = LIBRARY_MENU
    constructor(public bale: MenuBit) {}
}

export const PRINT_MENU = '[Render action] Print Menu'
export class PrintMenu implements Action<MenuBit> {
    readonly type = PRINT_MENU
    constructor(public bale: MenuBit) {}
}

export const ROUTE_MENU = '[Route action] Route Menu'
export class RouteMenu implements Action<undefined> {
    readonly type = ROUTE_MENU
    constructor(public bale: undefined) {}
}

export const FLEET_MENU = '[Menu action] Fleet Menu'
export class FleetMenu implements Action<MenuBit | undefined> {
    readonly type = FLEET_MENU
    constructor(public bale?: MenuBit) {}
}

export const SAGA_TORN_STATE_MENU = '[Menu action] Saga Torn State Menu'
export class SagaTornStateMenu implements Action<MenuBit> {
    readonly type = SAGA_TORN_STATE_MENU
    constructor(public bale: MenuBit) {}
}

export type Actions =
    | OpenMenu
    | InitMenu
    | UpdateMenu
    | CloseMenu
    | PrintMenu
    | LibraryMenu
    | RouteMenu
    | FleetMenu
    | SagaTornStateMenu
