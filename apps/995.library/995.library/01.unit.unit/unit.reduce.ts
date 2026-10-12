import clone from 'clone-deep'
import * as Act from './unit.action'
import { UnitModel } from './unit.model'
import * as Buzz from './unit.buzzer'
import type State from '../99.core/state'

export function reducer(
    model: UnitModel = new UnitModel(),
    act: Act.Actions,
    state?: State,
) {
    switch (act.type) {
        case Act.UPDATE_UNIT:
            return Buzz.updateUnit(clone(model, true), act.bale, state)

        case Act.INIT_UNIT:
            return Buzz.initUnit(clone(model, true), act.bale, state)

        case Act.LIST_UNIT:
            return Buzz.listUnit(clone(model, true), act.bale, state)

        case Act.CREATE_UNIT:
            return Buzz.createUnit(clone(model, true), act.bale, state)

        case Act.TEST_UNIT:
            return Buzz.testUnit(clone(model, true), act.bale, state)

        case Act.FLATTEN_UNIT:
            return Buzz.flattenUnit(clone(model, true), act.bale, state)

        case Act.CONTAIN_UNIT:
            return Buzz.containUnit(clone(model, true), act.bale, state)

        default:
            return model
    }
}
