import { Action } from '../99.core/interface/action.interface.js'
import repobotBit from './fce/repobot.bit.js'

// repobot actions

export const INIT_REPOBOT = '[repobot action] Init repobot'
export class InitRepobot implements Action {
    readonly type = INIT_REPOBOT
    constructor(public bale: repobotBit) {}
}

export const UPDATE_REPOBOT = '[repobot action] Update repobot'
export class UpdateRepobot implements Action {
    readonly type = UPDATE_REPOBOT
    constructor(public bale: repobotBit) {}
}

export const TEST_REPOBOT = '[Test action] Test repobot'
export class TestRepobot implements Action {
    readonly type = TEST_REPOBOT
    constructor(public bale: repobotBit) {}
}

export const INTELLECT_REPOBOT = '[Intellect action] Intellect repobot'
export class IntellectRepobot implements Action {
    readonly type = INTELLECT_REPOBOT
    constructor(public bale: repobotBit) {}
}

export const VISION_REPOBOT = '[Vision action] Vision repobot'
export class VisionRepobot implements Action {
    readonly type = VISION_REPOBOT
    constructor(public bale: repobotBit) {}
}

export const LIST_REPOBOT = '[List action] List repobot'
export class ListRepobot implements Action {
    readonly type = LIST_REPOBOT
    constructor(public bale: repobotBit) {}
}

export const CONNECT_REPOBOT = '[Connect action] Connect repobot'
export class ConnectRepobot implements Action {
    readonly type = CONNECT_REPOBOT
    constructor(public bale: repobotBit) {}
}

export const DISCONNECT_REPOBOT = '[Disconnect action] Disconnect repobot'
export class DisconnectRepobot implements Action {
    readonly type = DISCONNECT_REPOBOT
    constructor(public bale: repobotBit) {}
}

export type Actions =
    | InitRepobot
    | UpdateRepobot
    | TestRepobot
    | IntellectRepobot
    | VisionRepobot
    | ListRepobot
    | ConnectRepobot
    | DisconnectRepobot
