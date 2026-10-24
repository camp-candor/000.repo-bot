import type { Action } from '../99.core/interface/action.interface'
import type ServerBit from './fce/server.bit'

// Server actions

export const INIT_SERVER = '[Server action] Init Server'
export class InitServer implements Action {
    readonly type = INIT_SERVER
    constructor(public bale: ServerBit) {}
}

export const UPDATE_SERVER = '[Server action] Update Server'
export class UpdateServer implements Action {
    readonly type = UPDATE_SERVER
    constructor(public bale: ServerBit) {}
}

export type Actions = InitServer | UpdateServer
