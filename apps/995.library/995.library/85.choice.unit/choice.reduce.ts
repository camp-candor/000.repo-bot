import clone from 'clone-deep'
import * as Act from './choice.action'
import { ChoiceModel } from './choice.model'
import * as Buzz from './choice.buzzer'
import type State from '../99.core/state'

export function reducer(
    model: ChoiceModel = new ChoiceModel(),
    act: Act.Actions,
    state?: State,
) {
    switch (act.type) {
        case Act.UPDATE_CHOICE:
            return Buzz.updateChoice(clone(model, true), act.bale, state)

        case Act.INIT_CHOICE:
            return Buzz.initChoice(clone(model, true), act.bale, state)

        case Act.OPEN_CHOICE:
            return Buzz.openChoice(clone(model, true), act.bale, state)

        case Act.KEY_CHOICE:
            return Buzz.keyChoice(clone(model, true), act.bale, state)

        case Act.TOWER_CHOICE:
            return Buzz.towerChoice(clone(model, true), act.bale, state)

        default:
            return model
    }
}
