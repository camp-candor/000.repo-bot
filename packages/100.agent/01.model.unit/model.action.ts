import { Action } from '../99.core/interface/action.interface.js'
import ModelBit from './fce/model.bit.js'

export const INIT_MODEL = '[Model action] Init Model'
export class InitModel implements Action {
    readonly type = INIT_MODEL
    constructor(public bale: ModelBit) {}
}

export const WRITE_MODEL = '[Model action] Write Model'
export class WriteModel implements Action {
    readonly type = WRITE_MODEL
    constructor(public bale: ModelBit) {}
}

export const UPDATE_MODEL = '[Model action] Update Model'
export class UpdateModel implements Action {
    readonly type = UPDATE_MODEL
    constructor(public bale: ModelBit) {}
}

export const CREATE_MODEL = '[Model action] Create Model'
export class CreateModel implements Action {
    readonly type = CREATE_MODEL
    constructor(public bale: ModelBit) {}
}

export const READ_MODEL = '[Model action] Read Model'
export class ReadModel implements Action {
    readonly type = READ_MODEL
    constructor(public bale: ModelBit) {}
}

export const DELETE_MODEL = '[Model action] Delete Model'
export class DeleteModel implements Action {
    readonly type = DELETE_MODEL
    constructor(public bale: ModelBit) {}
}

export const REMOVE_MODEL = '[Model action] Remove Model'
export class RemoveModel implements Action {
    readonly type = REMOVE_MODEL
    constructor(public bale: ModelBit) {}
}

export const LIST_MODEL = '[List action] List Model'
export class ListModel implements Action {
    readonly type = LIST_MODEL
    constructor(public bale: ModelBit) {}
}

export type Actions =
    | InitModel
    | UpdateModel
    | CreateModel
    | ReadModel
    | DeleteModel
    | RemoveModel
    | WriteModel
    | ListModel
