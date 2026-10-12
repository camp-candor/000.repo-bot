import type { Action } from '../99.core/interface/action.interface'
import type ConsoleBit from './fce/console.bit'

export const INIT_CONSOLE = '[Console action] Init Console'
export class InitConsole implements Action<ConsoleBit> {
    readonly type = INIT_CONSOLE
    constructor(public bale: ConsoleBit) {}
}

export const UPDATE_CONSOLE = '[Console action] Update Console'
export class UpdateConsole implements Action<ConsoleBit> {
    readonly type = UPDATE_CONSOLE
    constructor(public bale: ConsoleBit) {}
}

export const READ_CONSOLE = '[Read action] Read Console'
export class ReadConsole implements Action<ConsoleBit> {
    readonly type = READ_CONSOLE
    constructor(public bale: ConsoleBit) {}
}

export const WRITE_CONSOLE = '[Write action] Write Console'
export class WriteConsole implements Action<ConsoleBit> {
    readonly type = WRITE_CONSOLE
    constructor(public bale: ConsoleBit) {}
}

export const REMOVE_CONSOLE = '[Remove action] Remove Console'
export class RemoveConsole implements Action<ConsoleBit> {
    readonly type = REMOVE_CONSOLE
    constructor(public bale: ConsoleBit) {}
}

export const DELETE_CONSOLE = '[Delete action] Delete Console'
export class DeleteConsole implements Action<ConsoleBit> {
    readonly type = DELETE_CONSOLE
    constructor(public bale: ConsoleBit) {}
}

export const CREATE_CONSOLE = '[Create action] Create Console'
export class CreateConsole implements Action<ConsoleBit> {
    readonly type = CREATE_CONSOLE
    constructor(public bale: ConsoleBit) {}
}

export type Actions =
    | InitConsole
    | UpdateConsole
    | ReadConsole
    | WriteConsole
    | RemoveConsole
    | DeleteConsole
    | CreateConsole
