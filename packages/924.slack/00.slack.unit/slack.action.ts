import { Action } from '../99.core/interface/action.interface.js'
import slackBit from './fce/slack.bit.js'

// slack actions

export const INIT_SLACK = '[Slack action] Init Slack'
export class InitSlack implements Action {
    readonly type = INIT_SLACK
    constructor(public bale: slackBit) {}
}

export const UPDATE_SLACK = '[Slack action] Update Slack'
export class UpdateSlack implements Action {
    readonly type = UPDATE_SLACK
    constructor(public bale: slackBit) {}
}

export const TEST_SLACK = '[Test action] Test Slack'
export class TestSlack implements Action {
    readonly type = TEST_SLACK
    constructor(public bale: slackBit) {}
}

export const INTELLECT_SLACK = '[Intellect action] Intellect Slack'
export class IntellectSlack implements Action {
    readonly type = INTELLECT_SLACK
    constructor(public bale: slackBit) {}
}

export const VISION_SLACK = '[Vision action] Vision Slack'
export class VisionSlack implements Action {
    readonly type = VISION_SLACK
    constructor(public bale: slackBit) {}
}

export const LIST_SLACK = '[List action] List Slack'
export class ListSlack implements Action {
    readonly type = LIST_SLACK
    constructor(public bale: slackBit) {}
}

export const CONNECT_SLACK = '[Connect action] Connect Slack'
export class ConnectSlack implements Action {
    readonly type = CONNECT_SLACK
    constructor(public bale: slackBit) {}
}

export const DISCONNECT_SLACK = '[Disconnect action] Disconnect Slack'
export class DisconnectSlack implements Action {
    readonly type = DISCONNECT_SLACK
    constructor(public bale: slackBit) {}
}

export type Actions =
    | InitSlack
    | UpdateSlack
    | TestSlack
    | IntellectSlack
    | VisionSlack
    | ListSlack
    | ConnectSlack
    | DisconnectSlack
