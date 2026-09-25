import clone from 'clone-deep'
import * as Act from './deployment.action'
import { DeploymentModel } from './deployment.model'
import * as Buzz from './deployment.buzzer'
import State from '../99.core/state'

export function reducer(
    model: DeploymentModel = new DeploymentModel(),
    act: Act.Actions,
    state?: State,
) {
    switch (act.type) {
        case Act.UPDATE_DEPLOYMENT:
            return Buzz.updateDeployment(clone(model), act.bale, state)

        case Act.INIT_DEPLOYMENT:
            return Buzz.initDeployment(clone(model), act.bale, state)

        case Act.LIST_DEPLOYMENT:
            return Buzz.listDeployment(clone(model), act.bale, state)

        case Act.DELETE_DEPLOYMENT:
            return Buzz.deleteDeployment(clone(model), act.bale, state)

        case Act.TEST_DEPLOYMENT:
            return Buzz.testDeployment(clone(model), act.bale, state)

        case Act.CURRENT_DEPLOYMENT:
            return Buzz.currentDeployment(clone(model), act.bale, state)

        case Act.WIPE_DEPLOYMENT:
            return Buzz.wipeDeployment(clone(model), act.bale, state)

        default:
            return model
    }
}
