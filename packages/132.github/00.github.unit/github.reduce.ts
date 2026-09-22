import clone from 'clone-deep'
import * as Act from './github.action.js'
import { GithubModel } from './github.model.js'
import * as Buzz from './github.buzzer.js'
import State from '../99.core/state.js'

export function reducer(
    model: GithubModel = new GithubModel(),
    act: Act.Actions,
    state?: State,
) {
    switch (act.type) {
        case Act.UPDATE_GITHUB:
            return Buzz.updateGithub(clone(model), act.bale, state)

        case Act.INIT_GITHUB:
            return Buzz.initGithub(clone(model), act.bale, state)

        case Act.TEST_GITHUB:
            return Buzz.testGithub(clone(model), act.bale, state)

        case Act.LIST_GITHUB:
            return Buzz.listGithub(clone(model), act.bale, state)

        default:
            return model
    }
}
