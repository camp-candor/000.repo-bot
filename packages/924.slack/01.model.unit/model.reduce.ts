import clone from 'clone-deep'
import * as Act from './model.action.js'
import { ModelModel } from './model.model.js'
import * as Buzz from './model.buzzer.js'
import State from '../99.core/state.js'

export function reducer(
    model: ModelModel = new ModelModel(),
    act: Act.Actions,
    state?: State,
) {
    switch (act.type) {
        case Act.REMOVE_MODEL:
            return Buzz.removeModel(clone(model), act.bale, state)

        case Act.DELETE_MODEL:
            return Buzz.deleteModel(clone(model), act.bale, state)

        case Act.READ_MODEL:
            return Buzz.readModel(clone(model), act.bale, state)

        case Act.WRITE_MODEL:
            return Buzz.writeModel(clone(model), act.bale, state)

        case Act.CREATE_MODEL:
            return Buzz.createModel(clone(model), act.bale, state)

        case Act.UPDATE_MODEL:
            return Buzz.updateModel(clone(model), act.bale, state)

        case Act.INIT_MODEL:
            return Buzz.initModel(clone(model), act.bale, state)

        case Act.LIST_MODEL:
            return Buzz.listModel(clone(model), act.bale, state)

        default:
            return model
    }
}
