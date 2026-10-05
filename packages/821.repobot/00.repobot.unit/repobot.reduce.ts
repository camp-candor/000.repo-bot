import clone from 'clone-deep'
import * as Act from './repobot.action.js'
import { RepobotModel } from './repobot.model.js'
import * as Buzz from './repobot.buzzer.js'
import type State from '../99.core/state.js'

export function reducer(
    model: RepobotModel = new RepobotModel(),
    act: Act.Actions,
    state?: State,
) {
    switch (act.type) {
        case Act.INIT_REPOBOT:
            return Buzz.initRepobot(clone(model), act.bale, state)

        case Act.UPDATE_REPOBOT:
            return Buzz.updateRepobot(clone(model), act.bale, state)

        case Act.CONNECT_REPOBOT:
            return Buzz.connectRepobot(clone(model), act.bale, state)

        case Act.DISCONNECT_REPOBOT:
            return Buzz.disconnectRepobot(clone(model), act.bale, state)

        default:
            return model
    }
}
