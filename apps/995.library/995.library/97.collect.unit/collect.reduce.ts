import * as Act from './collect.action'
import { CollectModel } from './collect.model'
import * as Buzz from './collect.buzzer'
import type State from '../99.core/state'

export function reducer(
    model: CollectModel = new CollectModel(),
    act: Act.Actions,
    state?: State,
) {
    switch (act.type) {
        case Act.UPDATE_COLLECT:
            return Buzz.updateCollect(model, act.bale, state)

        case Act.INIT_COLLECT:
            return Buzz.initCollect(model, act.bale, state)

        case Act.READ_COLLECT:
            return Buzz.readCollect(model, act.bale, state)

        case Act.WRITE_COLLECT:
            return Buzz.writeCollect(model, act.bale, state)

        case Act.CREATE_COLLECT:
            return Buzz.createCollect(model, act.bale, state)

        case Act.DELETE_COLLECT:
            return Buzz.deleteCollect(model, act.bale, state)

        case Act.REMOVE_COLLECT:
            return Buzz.removeCollect(model, act.bale, state)

        case Act.EMPTY_COLLECT:
            return Buzz.emptyCollect(model, act.bale, state)

        case Act.FETCH_COLLECT:
            return Buzz.fetchCollect(model, act.bale, state)

        case Act.MODEL_COLLECT:
            return Buzz.modelCollect(model, act.bale, state)

        case Act.GET_COLLECT:
            return Buzz.getCollect(model, act.bale, state)

        case Act.PUT_COLLECT:
            return Buzz.putCollect(model, act.bale, state)

        case Act.FORMAT_COLLECT:
            return Buzz.formatCollect(model, act.bale, state)

        case Act.DOT_COLLECT:
            return Buzz.dotCollect(model, act.bale, state)

        case Act.LIST_COLLECT:
            return Buzz.listCollect(model, act.bale, state)

        case Act.HASH_COLLECT:
            return Buzz.hashCollect(model, act.bale, state)

        default:
            return model
    }
}
