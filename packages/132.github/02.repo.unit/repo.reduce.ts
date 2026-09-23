import clone from 'clone-deep'
import * as Act from './repo.action'
import { RepoModel } from './repo.model'
import * as Buzz from './repo.buzzer'
import State from '../99.core/state'

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

        default:
            return model
    }
}
