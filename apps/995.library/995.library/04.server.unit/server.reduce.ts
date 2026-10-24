import clone from 'clone-deep'
import * as Act from './server.action'
import { ServerModel } from './server.model'
import * as Buzz from './server.buzzer'
import type State from '../99.core/state'

export function reducer(
    model: ServerModel = new ServerModel(),
    act: Act.Actions,
    state?: State,
) {
    switch (act.type) {
        case Act.UPDATE_SERVER:
            return Buzz.updateServer(clone(model, true), act.bale, state)

        case Act.INIT_SERVER:
            return Buzz.initServer(clone(model, true), act.bale, state)

        default:
            return model
    }
}
