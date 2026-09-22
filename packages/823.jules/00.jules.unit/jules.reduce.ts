import clone from 'clone-deep'
import * as Act from './jules.action.js'
import { JulesModel } from './jules.model.js'
import * as Buzz from './jules.buzzer.js'
import type State from '../99.core/state.js'

export function reducer(
    model: JulesModel = new JulesModel(),
    act: Act.Actions,
    state?: State,
) {
    switch (act.type) {
        case Act.INIT_JULES:
            return Buzz.initJules(clone(model), act.bale, state)
        case Act.UPDATE_JULES:
            return Buzz.updateJules(clone(model), act.bale, state)
        case Act.DISPATCH_JULES_TASK:
            return Buzz.dispatchJulesTask(clone(model), act.bale, state)
        case Act.CHECK_JULES_STATUS:
            return Buzz.checkJulesStatus(clone(model), act.bale, state)
        default:
            return model
    }
}
