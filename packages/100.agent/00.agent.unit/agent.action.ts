import { Action } from '../99.core/interface/action.interface.js'
import agentBit from './fce/agent.bit.js'

// agent actions

export const INIT_agent = '[agent action] Init agent'
export class Initagent implements Action {
    readonly type = INIT_agent
    constructor(public bale: agentBit) {}
}

export const UPDATE_agent = '[agent action] Update agent'
export class Updateagent implements Action {
    readonly type = UPDATE_agent
    constructor(public bale: agentBit) {}
}

export const TEST_agent = '[Test action] Test agent'
export class Testagent implements Action {
    readonly type = TEST_agent
    constructor(public bale: agentBit) {}
}

export const INTELLECT_agent = '[Intellect action] Intellect agent'
export class Intellectagent implements Action {
    readonly type = INTELLECT_agent
    constructor(public bale: agentBit) {}
}

export const VISION_agent = '[Vision action] Vision agent'
export class Visionagent implements Action {
    readonly type = VISION_agent
    constructor(public bale: agentBit) {}
}

export const LIST_agent = '[List action] List agent'
export class Listagent implements Action {
    readonly type = LIST_agent
    constructor(public bale: agentBit) {}
}

export const CONNECT_agent = '[Connect action] Connect agent'
export class Connectagent implements Action {
    readonly type = CONNECT_agent
    constructor(public bale: agentBit) {}
}

export const DISCONNECT_agent = '[Disconnect action] Disconnect agent'
export class Disconnectagent implements Action {
    readonly type = DISCONNECT_agent
    constructor(public bale: agentBit) {}
}

export type Actions =
    | Initagent
    | Updateagent
    | Testagent
    | Intellectagent
    | Visionagent
    | Listagent
    | Connectagent
    | Disconnectagent
