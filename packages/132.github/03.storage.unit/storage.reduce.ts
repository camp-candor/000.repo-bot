import clone from 'clone-deep'
import * as Act from './storage.action'
import { StorageModel } from './storage.model'
import * as Buzz from './storage.buzzer'
import State from '../99.core/state'

export function reducer(
    model: StorageModel = new StorageModel(),
    act: Act.Actions,
    state?: State,
) {
    switch (act.type) {
        case Act.UPDATE_STORAGE:
            return Buzz.updateStorage(clone(model), act.bale, state)

        case Act.INIT_STORAGE:
            return Buzz.initStorage(clone(model), act.bale, state)

        default:
            return model
    }
}
