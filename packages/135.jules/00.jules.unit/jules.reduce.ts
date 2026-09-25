import clone from 'clone-deep'
import * as Act from './jules.action.js'
import { JulesModel } from './jules.model.js'
import * as Buzz from './jules.buzzer.js'
import State from '../99.core/state.js'

export function reducer(
    model: JulesModel = new JulesModel(),
    act: Act.Actions,
    state?: State,
) {
    switch (act.type) {
        case Act.UPDATE_JULES:
            return Buzz.updateJules(clone(model), act.bale, state)

        case Act.INIT_JULES:
            return Buzz.initJules(clone(model), act.bale, state)

        case Act.TEST_JULES:
            return Buzz.testJules(clone(model), act.bale, state)

        case Act.LIST_JULES:
            return Buzz.listJules(clone(model), act.bale, state)

        default:
            return model
    }
}
