import { Action } from '../99.core/interface/action.interface.js'
import WorkersBit from './fce/workers.bit.js'

// Workers actions

export const INIT_WORKERS = '[Workers action] Init Workers'
export class InitWorkers implements Action {
    readonly type = INIT_WORKERS
    constructor(public bale: WorkersBit) {}
}

export const WRITE_WORKERS = '[Workers action] Write Workers'
export class WriteWorkers implements Action {
    readonly type = WRITE_WORKERS
    constructor(public bale: WorkersBit) {}
}

export const UPDATE_WORKERS = '[Workers action] Update Workers'
export class UpdateWorkers implements Action {
    readonly type = UPDATE_WORKERS
    constructor(public bale: WorkersBit) {}
}

export const CREATE_WORKERS = '[Workers action] Create Workers'
export class CreateWorkers implements Action {
    readonly type = CREATE_WORKERS
    constructor(public bale: WorkersBit) {}
}

export const READ_WORKERS = '[Workers action] Read Workers'
export class ReadWorkers implements Action {
    readonly type = READ_WORKERS
    constructor(public bale: WorkersBit) {}
}

export const DELETE_WORKERS = '[Workers action] Delete Workers'
export class DeleteWorkers implements Action {
    readonly type = DELETE_WORKERS
    constructor(public bale: WorkersBit) {}
}

export const REMOVE_WORKERS = '[Workers action] Remove Workers'
export class RemoveWorkers implements Action {
    readonly type = REMOVE_WORKERS
    constructor(public bale: WorkersBit) {}
}

export const SELECT_WORKERS = '[Select action] Select Workers'
export class SelectWorkers implements Action {
    readonly type = SELECT_WORKERS
    constructor(public bale: WorkersBit) {}
}

export const LIST_WORKERS = '[Workers action] List Workers'
export class ListWorkers implements Action {
    readonly type = LIST_WORKERS
    constructor(public bale: WorkersBit) {}
}

export type Actions =
    | InitWorkers
    | UpdateWorkers
    | CreateWorkers
    | ReadWorkers
    | DeleteWorkers
    | RemoveWorkers
    | WriteWorkers
    | SelectWorkers
    | ListWorkers
