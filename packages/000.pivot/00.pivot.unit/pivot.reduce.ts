import clone from 'clone-deep'
import * as Act from './pivot.action.js'
import { PivotModel } from './pivot.model.js'
import * as Buzz from './pivot.buzzer.js'
import State from '../99.core/state.js'

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

        case Act.TEST_PIVOT:
            return Buzz.testPivot(clone(model), act.bale, state)

        case Act.LIST_PIVOT:
            return Buzz.listPivot(clone(model), act.bale, state)

        default:
            return model
    }
}
