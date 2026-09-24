import clone from 'clone-deep'
import * as Act from './slack.action.js'
import { SlackModel } from './slack.model.js'
import * as Buzz from './slack.buzzer.js'
import State from '../99.core/state.js'

export function reducer(
    model: SlackModel = new SlackModel(),
    act: Act.Actions,
    state?: State,
) {
    switch (act.type) {
        case Act.UPDATE_SLACK:
            return Buzz.updateSlack(clone(model), act.bale, state)

        case Act.INIT_SLACK:
            return Buzz.initSlack(clone(model), act.bale, state)

        case Act.TEST_SLACK:
            return Buzz.testSlack(clone(model), act.bale, state)

        case Act.LIST_SLACK:
            return Buzz.listSlack(clone(model), act.bale, state)

        case Act.CONNECT_SLACK:
            return Buzz.connectSlack(clone(model), act.bale, state)

        case Act.DISCONNECT_SLACK:
            return Buzz.disconnectSlack(clone(model), act.bale, state)

        default:
            return model
    }
}
