import type { Action } from '../99.core/interface/action.interface'
import type PackageBit from './fce/package.bit'

export const INIT_PACKAGE = '[Package action] Init Package'
export class InitPackage implements Action<PackageBit> {
    readonly type = INIT_PACKAGE
    constructor(public bale: PackageBit) {}
}

export const UPDATE_PACKAGE = '[Package action] Update Package'
export class UpdatePackage implements Action<PackageBit> {
    readonly type = UPDATE_PACKAGE
    constructor(public bale: PackageBit) {}
}

export const CREATE_PACKAGE = '[Create action] Create Package'
export class CreatePackage implements Action<PackageBit> {
    readonly type = CREATE_PACKAGE
    constructor(public bale: PackageBit) {}
}

export type Actions = InitPackage | UpdatePackage | CreatePackage
