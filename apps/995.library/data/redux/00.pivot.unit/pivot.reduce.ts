import clone from 'clone-deep'
import * as Act from './pivot.action'
import { PivotModel } from './pivot.model'
import * as Buzz from './pivot.buzzer'
import type State from '../99.core/state'

export function reducer(
    model: PivotModel = new PivotModel(),
    act: Act.Actions,
    state?: State,
) {
    switch (act.type) {
        case Act.UPDATE_PIVOT:
            return Buzz.updatePivot(clone(model), act.bale, state)

        case Act.INIT_PIVOT:
            return Buzz.initPivot(clone(model), act.bale, state)

        default:
            return model
    }
}
