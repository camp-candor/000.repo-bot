import type { Action } from '../99.core/interface/action.interface'
import type LibraryBit from './fce/library.bit'

// Library actions

export const INIT_LIBRARY = '[Library action] Init Library'
export class InitLibrary implements Action {
    readonly type = INIT_LIBRARY
    constructor(public bale: LibraryBit) {}
}

export const UPDATE_LIBRARY = '[Library action] Update Library'
export class UpdateLibrary implements Action {
    readonly type = UPDATE_LIBRARY
    constructor(public bale: LibraryBit) {}
}

export const LIST_LIBRARY = '[List action] List Library'
export class ListLibrary implements Action {
    readonly type = LIST_LIBRARY
    constructor(public bale: LibraryBit) {}
}

export const PROGRESS_LIBRARY = '[Progress action] Progress Library'
export class ProgressLibrary implements Action {
    readonly type = PROGRESS_LIBRARY
    constructor(public bale: undefined) {}
}

export const SCAN_LIBRARY = '[Scan action] Scan Library'
export class ScanLibrary implements Action {
    readonly type = SCAN_LIBRARY
    constructor(public bale: undefined) {}
}

export const LAUNCH_LIBRARY = '[Launch action] Launch Library'
export class LaunchLibrary implements Action {
    readonly type = LAUNCH_LIBRARY
    constructor(public bale: undefined) {}
}

export const FLAT_LIBRARY = '[Flat action] Flat Library'
export class FlatLibrary implements Action {
    readonly type = FLAT_LIBRARY
    constructor(public bale?: LibraryBit) {}
}

export type Actions =
    | InitLibrary
    | UpdateLibrary
    | ListLibrary
    | ProgressLibrary
    | ScanLibrary
    | LaunchLibrary
    | FlatLibrary
