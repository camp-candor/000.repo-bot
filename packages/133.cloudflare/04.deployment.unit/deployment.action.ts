import { Action } from '../99.core/interface/action.interface'
import DeploymentBit from './fce/deployment.bit'

// Deployment actions

export const INIT_DEPLOYMENT = '[Deployment action] Init Deployment'
export class InitDeployment implements Action {
    readonly type = INIT_DEPLOYMENT
    constructor(public bale: DeploymentBit) {}
}

export const UPDATE_DEPLOYMENT = '[Deployment action] Update Deployment'
export class UpdateDeployment implements Action {
    readonly type = UPDATE_DEPLOYMENT
    constructor(public bale: DeploymentBit) {}
}

export const LIST_DEPLOYMENT = '[List action] List Deployment'
export class ListDeployment implements Action {
    readonly type = LIST_DEPLOYMENT
    constructor(public bale: DeploymentBit) {}
}

export const DELETE_DEPLOYMENT = '[Delete action] Delete Deployment'
export class DeleteDeployment implements Action {
    readonly type = DELETE_DEPLOYMENT
    constructor(public bale: undefined) {}
}

export const TEST_DEPLOYMENT = '[Test action] Test Deployment'
export class TestDeployment implements Action {
    readonly type = TEST_DEPLOYMENT
    constructor(public bale: undefined) {}
}

export const CURRENT_DEPLOYMENT = '[Current action] Current Deployment'
export class CurrentDeployment implements Action {
    readonly type = CURRENT_DEPLOYMENT
    constructor(public bale: undefined) {}
}

export const WIPE_DEPLOYMENT = '[Wipe action] Wipe Deployment'
export class WipeDeployment implements Action {
    readonly type = WIPE_DEPLOYMENT
    constructor(public bale: undefined) {}
}

export type Actions =
    | InitDeployment
    | UpdateDeployment
    | ListDeployment
    | DeleteDeployment
    | TestDeployment
    | CurrentDeployment
    | WipeDeployment
