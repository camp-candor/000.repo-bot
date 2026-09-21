import type { Action } from '../99.core/interface/action.interface'
import type AgentBit from './fce/agent.bit'

// Agent actions

export const INIT_AGENT = '[Agent action] Init Agent'
export class InitAgent implements Action {
    readonly type = INIT_AGENT
    constructor(public bale: AgentBit) {}
}

export const UPDATE_AGENT = '[Agent action] Update Agent'
export class UpdateAgent implements Action {
    readonly type = UPDATE_AGENT
    constructor(public bale: AgentBit) {}
}

export const ORACLE_AGENT = '[Oracle action] Oracle Agent'
export class OracleAgent implements Action {
    readonly type = ORACLE_AGENT
    constructor(public bale: AgentBit) {}
}

export const TEST_AGENT = '[Test action] Test Agent'
export class TestAgent implements Action {
    readonly type = TEST_AGENT
    constructor(public bale: AgentBit) {}
}

export type Actions = InitAgent | UpdateAgent | OracleAgent | TestAgent
