import clone from 'clone-deep'
import * as Act from './storage.action.js'
import { StorageModel } from './storage.model.js'
import * as Buzz from './storage.buzzer.js'
import State from '../99.core/state.js'

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

        case Act.CHECK_DRAINAGE_STATUS:
            return Buzz.checkDrainageStatus(clone(model), act.bale, state)

        case Act.COUNTDOWN_DRAINAGE:
            return Buzz.countdownDrainage(clone(model), act.bale, state)

        case Act.FETCH_STORAGE_RECORDS:
            return Buzz.fetchStorageRecords(clone(model), act.bale, state)

        case Act.INSPECT_STORAGE_RECORD:
            return Buzz.inspectStorageRecord(clone(model), act.bale, state)

        default:
            return model
    }
}
