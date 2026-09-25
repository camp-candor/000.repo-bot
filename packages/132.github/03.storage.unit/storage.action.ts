import { Action } from '../99.core/interface/action.interface.js'
import StorageBit from './fce/storage.bit.js'

export const INIT_STORAGE = '[Storage action] Init Storage'
export class InitStorage implements Action {
    readonly type = INIT_STORAGE
    constructor(public bale: StorageBit) {}
}

export const UPDATE_STORAGE = '[Storage action] Update Storage'
export class UpdateStorage implements Action {
    readonly type = UPDATE_STORAGE
    constructor(public bale: StorageBit) {}
}

export const CHECK_DRAINAGE_STATUS = '[Storage action] Check Drainage Status'
export class CheckDrainageStatus implements Action {
    readonly type = CHECK_DRAINAGE_STATUS
    constructor(public bale: StorageBit) {}
}

export const COUNTDOWN_DRAINAGE = '[Storage action] Countdown Drainage'
export class CountdownDrainage implements Action {
    readonly type = COUNTDOWN_DRAINAGE
    constructor(public bale: StorageBit) {}
}

export const FETCH_STORAGE_RECORDS = '[Storage action] Fetch Storage Records'
export class FetchStorageRecords implements Action {
    readonly type = FETCH_STORAGE_RECORDS
    constructor(public bale: StorageBit) {}
}

export const INSPECT_STORAGE_RECORD = '[Storage action] Inspect Storage Record'
export class InspectStorageRecord implements Action {
    readonly type = INSPECT_STORAGE_RECORD
    constructor(public bale: StorageBit) {}
}

export type Actions =
    | InitStorage
    | UpdateStorage
    | CheckDrainageStatus
    | CountdownDrainage
    | FetchStorageRecords
    | InspectStorageRecord
