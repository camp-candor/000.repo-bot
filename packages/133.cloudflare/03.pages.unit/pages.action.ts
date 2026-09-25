import { Action } from '../99.core/interface/action.interface.js'
import PagesBit from './fce/pages.bit.js'

export const INIT_PAGES = '[Pages action] Init Pages'
export class InitPages implements Action {
    readonly type = INIT_PAGES
    constructor(public bale: PagesBit) {}
}

export const WRITE_PAGES = '[Pages action] Write Pages'
export class WritePages implements Action {
    readonly type = WRITE_PAGES
    constructor(public bale: PagesBit) {}
}

export const UPDATE_PAGES = '[Pages action] Update Pages'
export class UpdatePages implements Action {
    readonly type = UPDATE_PAGES
    constructor(public bale: PagesBit) {}
}

export const CREATE_PAGES = '[Pages action] Create Pages'
export class CreatePages implements Action {
    readonly type = CREATE_PAGES
    constructor(public bale: PagesBit) {}
}

export const READ_PAGES = '[Pages action] Read Pages'
export class ReadPages implements Action {
    readonly type = READ_PAGES
    constructor(public bale: PagesBit) {}
}

export const DELETE_PAGES = '[Pages action] Delete Pages'
export class DeletePages implements Action {
    readonly type = DELETE_PAGES
    constructor(public bale: PagesBit) {}
}

export const REMOVE_PAGES = '[Pages action] Remove Pages'
export class RemovePages implements Action {
    readonly type = REMOVE_PAGES
    constructor(public bale: PagesBit) {}
}

export const LIST_PAGES = '[Pages action] List Pages'
export class ListPages implements Action {
    readonly type = LIST_PAGES
    constructor(public bale: PagesBit) {}
}

export const SELECT_PAGES = '[Select action] Select Pages'
export class SelectPages implements Action {
    readonly type = SELECT_PAGES
    constructor(public bale: PagesBit) {}
}

export type Actions =
    | ListPages
    | InitPages
    | UpdatePages
    | CreatePages
    | ReadPages
    | DeletePages
    | RemovePages
    | WritePages
    | SelectPages
