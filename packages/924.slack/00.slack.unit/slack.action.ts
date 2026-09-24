import { Action } from '../99.core/interface/action.interface.js'
import slackBit from './fce/slack.bit.js'

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

export const PROBE_HANDSHAKE = '[Slack action] Probe Handshake'
export class ProbeHandshake implements Action {
  readonly type = PROBE_HANDSHAKE
  constructor(public bale: slackBit) {}
}

export const SIMULATE_INTERACTION = '[Slack action] Simulate Interaction'
export class SimulateInteraction implements Action {
  readonly type = SIMULATE_INTERACTION
  constructor(public bale: slackBit) {}
}

export const DISPATCH_TEST_CARD = '[Slack action] Dispatch Test Card'
export class DispatchTestCard implements Action {
  readonly type = DISPATCH_TEST_CARD
  constructor(public bale: slackBit) {}
}

export const LIST_SLACK = '[List action] List Slack'
export class ListSlack implements Action {
  readonly type = LIST_SLACK
  constructor(public bale: slackBit) {}
}

export type Actions =
  | InitSlack
  | UpdateSlack
  | TestSlack
  | ProbeHandshake
  | SimulateInteraction
  | DispatchTestCard
  | ListSlack
