import type { Action } from '../99.core/interface/action.interface.js'
import type RepobotBit from './fce/repobot.bit.js'

export const INIT_REPOBOT = '[Repobot action] Init Repobot'
export class InitRepobot implements Action {
    readonly type = INIT_REPOBOT
    constructor(public bale?: RepobotBit) {}
}

export const UPDATE_REPOBOT = '[Repobot action] Update Repobot'
export class UpdateRepobot implements Action {
    readonly type = UPDATE_REPOBOT
    constructor(public bale?: RepobotBit) {}
}

export const CONNECT_REPOBOT = '[Repobot action] Connect Repobot'
export class ConnectRepobot implements Action {
    readonly type = CONNECT_REPOBOT
    constructor(public bale?: RepobotBit) {}
}

export const DISCONNECT_REPOBOT = '[Repobot action] Disconnect Repobot'
export class DisconnectRepobot implements Action {
    readonly type = DISCONNECT_REPOBOT
    constructor(public bale?: RepobotBit) {}
}

export type Actions =
    InitRepobot | UpdateRepobot | ConnectRepobot | DisconnectRepobot
