import clone from 'clone-deep'
import * as Act from './alligator.action'
import { AlligatorModel } from './alligator.model'
import * as Buzz from './alligator.buzzer'
import type State from '../99.core/state'

export function reducer(
    model: AlligatorModel = new AlligatorModel(),
    act: Act.Actions,
    state?: State,
) {
    switch (act.type) {
        case Act.UPDATE_ALLIGATOR:
            return Buzz.updateAlligator(clone(model, true), act.bale, state)

        case Act.INIT_ALLIGATOR:
            return Buzz.initAlligator(clone(model, true), act.bale, state)

        default:
            return model
    }
}
