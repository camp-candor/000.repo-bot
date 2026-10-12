import clone from 'clone-deep'
import * as Act from './data.action'
import { DataModel } from './data.model'
import * as Buzz from './data.buzzer'
import type State from '../99.core/state'

export function reducer(
    model: DataModel = new DataModel(),
    act: Act.Actions,
    state?: State,
) {
    switch (act.type) {
        case Act.UPDATE_DATA:
            return Buzz.updateData(clone(model, true), act.bale, state)

        case Act.INIT_DATA:
            return Buzz.initData(clone(model, true), act.bale, state)

        case Act.FRAME_DATA:
            return Buzz.frameData(clone(model, true), act.bale, state)

        case Act.FLAT_DATA:
            return Buzz.flatData(clone(model, true), act.bale, state)

        default:
            return model
    }
}
