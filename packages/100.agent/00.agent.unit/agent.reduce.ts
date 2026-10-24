import clone from 'clone-deep'
import * as Act from './agent.action.js'
import { AgentModel } from './agent.model.js'
import * as Buzz from './agent.buzzer.js'
import State from '../99.core/state.js'

export function reducer(
    model: AgentModel = new AgentModel(),
    act: Act.Actions,
    state?: State,
) {
    switch (act.type) {
        case Act.UPDATE_agent:
            return Buzz.updateagent(clone(model), act.bale, state)

        case Act.INIT_agent:
            return Buzz.initagent(clone(model), act.bale, state)

        case Act.TEST_agent:
            return Buzz.testagent(clone(model), act.bale, state)

        case Act.LIST_agent:
            return Buzz.listagent(clone(model), act.bale, state)

        case Act.CONNECT_agent:
            return Buzz.connectagent(clone(model), act.bale, state)

        case Act.DISCONNECT_agent:
            return Buzz.disconnectagent(clone(model), act.bale, state)

        default:
            return model
    }
}
