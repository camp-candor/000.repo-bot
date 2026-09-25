import clone from 'clone-deep'
import * as Act from './workers.action.js'
import { WorkersModel } from './workers.model.js'
import * as Buzz from './workers.buzzer.js'
import State from '../99.core/state.js'

export function reducer(
    model: WorkersModel = new WorkersModel(),
    act: Act.Actions,
    state?: State,
) {
    switch (act.type) {
        case Act.REMOVE_WORKERS:
            return Buzz.removeWorkers(clone(model), act.bale, state)

        case Act.DELETE_WORKERS:
            return Buzz.deleteWorkers(clone(model), act.bale, state)

        case Act.READ_WORKERS:
            return Buzz.readWorkers(clone(model), act.bale, state)

        case Act.WRITE_WORKERS:
            return Buzz.writeWorkers(clone(model), act.bale, state)

        case Act.CREATE_WORKERS:
            return Buzz.createWorkers(clone(model), act.bale, state)

        case Act.UPDATE_WORKERS:
            return Buzz.updateWorkers(clone(model), act.bale, state)

        case Act.INIT_WORKERS:
            return Buzz.initWorkers(clone(model), act.bale, state)

        case Act.SELECT_WORKERS:
            return Buzz.selectWorkers(clone(model), act.bale, state)

        case Act.LIST_WORKERS:
            return Buzz.listWorkers(clone(model), act.bale, state)

        default:
            return model
    }
}
