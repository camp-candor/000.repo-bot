import clone from 'clone-deep'
import * as Act from './factory.action.js'
import { FactoryModel } from './factory.model.js'
import * as Buzz from './factory.buzzer.js'
import State from '../99.core/state.js'

export function reducer(
    model: FactoryModel = new FactoryModel(),
    act: Act.Actions,
    state?: State,
) {
    switch (act.type) {
        case Act.UPDATE_FACTORY:
            return Buzz.updateFactory(clone(model), act.bale, state)

        case Act.INIT_FACTORY:
            return Buzz.initFactory(clone(model), act.bale, state)

        case Act.TEST_FACTORY:
            return Buzz.testFactory(clone(model), act.bale, state)

        case Act.LIST_FACTORY:
            return Buzz.listFactory(clone(model), act.bale, state)

        default:
            return model
    }
}
