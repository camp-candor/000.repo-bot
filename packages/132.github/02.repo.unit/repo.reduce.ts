import clone from 'clone-deep'
import * as Act from './repo.action.js'
import { RepoModel } from './repo.model.js'
import * as Buzz from './repo.buzzer.js'
import State from '../99.core/state.js'

export function reducer(
    model: RepoModel = new RepoModel(),
    act: Act.Actions,
    state?: State,
) {
    switch (act.type) {
        case Act.UPDATE_REPO:
            return Buzz.updateRepo(clone(model), act.bale, state)

        case Act.INIT_REPO:
            return Buzz.initRepo(clone(model), act.bale, state)

        case Act.WRITE_REPO:
            return Buzz.writeRepo(clone(model), act.bale, state)

        case Act.LIST_REPO:
            return Buzz.listRepo(clone(model), act.bale, state)

        case Act.DELETE_REPO:
            return Buzz.deleteRepo(clone(model), act.bale, state)

        case Act.READ_REPO:
            return Buzz.readRepo(clone(model), act.bale, state)

        case Act.HEALTH_REPO:
            return Buzz.healthRepo(clone(model), act.bale, state)

        default:
            return model
    }
}
