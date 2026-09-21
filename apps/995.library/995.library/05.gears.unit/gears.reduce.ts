import clone from 'clone-deep'
import * as Act from './gears.action'
import { GearsModel } from './gears.model'
import * as Buzz from './gears.buzzer'
import type State from '../99.core/state'

export function reducer(
    model: GearsModel = new GearsModel(),
    act: Act.Actions,
    state?: State,
) {
    switch (act.type) {
        case Act.UPDATE_GEARS:
            return Buzz.updateGears(clone(model), act.bale, state)

        case Act.INIT_GEARS:
            return Buzz.initGears(clone(model), act.bale, state)

        case Act.TEST_GEARS:
            return Buzz.testGears(clone(model), act.bale, state)

        case Act.SEARCH_GEARS:
            return Buzz.searchGears(clone(model), act.bale, state)

        case Act.CREATE_GEARS:
            return Buzz.createGears(clone(model), act.bale, state)

        case Act.LORE_GEARS:
            return Buzz.loreGears(clone(model), act.bale, state)

        default:
            return model
    }
}
