import clone from 'clone-deep'
import * as Act from './agent.action'
import { AgentModel } from './agent.model'
import * as Buzz from './agent.buzzer'
import type State from '../99.core/state'

export function reducer(
    model: AgentModel = new AgentModel(),
    act: Act.Actions,
    state?: State,
) {
    switch (act.type) {
        case Act.UPDATE_AGENT:
            return Buzz.updateAgent(clone(model), act.bale, state)

        case Act.INIT_AGENT:
            return Buzz.initAgent(clone(model), act.bale, state)

        case Act.ORACLE_AGENT:
            return Buzz.oracleAgent(clone(model), act.bale, state)

        case Act.TEST_AGENT:
            return Buzz.testAgent(clone(model), act.bale, state)

        default:
            return model
    }
}
