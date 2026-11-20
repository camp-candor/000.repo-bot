import type { Action } from '../99.core/interface/action.interface'
import type LibraryBit from './fce/library.bit'

export const OPEN_HUMAN_SAVE_GATE = '[Gate action] Open Human Save Gate'
export class OpenHumanSaveGate implements Action<LibraryBit> {
    readonly type = OPEN_HUMAN_SAVE_GATE
    constructor(public bale: LibraryBit) {}
}

export const INIT_LIBRARY = '[Library action] Init Library'
export class InitLibrary implements Action<LibraryBit> {
    readonly type = INIT_LIBRARY
    constructor(public bale: LibraryBit) {}
}

export const UPDATE_LIBRARY = '[Library action] Update Library'
export class UpdateLibrary implements Action<LibraryBit> {
    readonly type = UPDATE_LIBRARY
    constructor(public bale: LibraryBit) {}
}

export const LIST_LIBRARY = '[List action] List Library'
export class ListLibrary implements Action<LibraryBit> {
    readonly type = LIST_LIBRARY
    constructor(public bale: LibraryBit) {}
}

export const PROGRESS_LIBRARY = '[Progress action] Progress Library'
export class ProgressLibrary implements Action<LibraryBit> {
    readonly type = PROGRESS_LIBRARY
    constructor(public bale: LibraryBit) {}
}

export const SCAN_LIBRARY = '[Scan action] Scan Library'
export class ScanLibrary implements Action<LibraryBit> {
    readonly type = SCAN_LIBRARY
    constructor(public bale: LibraryBit) {}
}

export const SCAN_FLEET = '[Scan action] Scan Fleet'
export class ScanFleet implements Action<LibraryBit> {
    readonly type = SCAN_FLEET
    constructor(public bale: LibraryBit) {}
}

export const LAUNCH_LIBRARY = '[Launch action] Launch Library'
export class LaunchLibrary implements Action<LibraryBit> {
    readonly type = LAUNCH_LIBRARY
    constructor(public bale: LibraryBit) {}
}

export const FLAT_LIBRARY = '[Flat action] Flat Library'
export class FlatLibrary implements Action<LibraryBit> {
    readonly type = FLAT_LIBRARY
    constructor(public bale: LibraryBit) {}
}

export const CHECK_GIT_WORKING_TREE = '[Git action] Check Git Working Tree'
export class CheckGitWorkingTree implements Action<LibraryBit> {
    readonly type = CHECK_GIT_WORKING_TREE
    constructor(public bale: LibraryBit) {}
}

export const PROGRESS_LIBRARY_SAGA = '[Progress action] Progress Library Saga'
export class ProgressLibrarySaga implements Action<LibraryBit> {
    readonly type = PROGRESS_LIBRARY_SAGA
    constructor(public bale: LibraryBit) {}
}

export const AUDIT_LIBRARY = '[Audit action] Audit Library'
export class AuditLibrary implements Action<LibraryBit> {
    readonly type = AUDIT_LIBRARY
    constructor(public bale?: LibraryBit) {}
}

export const STAGE_LOCKFILE_CONFLICT = '[Library action] Stage Lockfile Conflict'
export class StageLockfileConflict implements Action<LibraryBit> {
    readonly type = STAGE_LOCKFILE_CONFLICT
    constructor(public bale: LibraryBit) {}
}

export const PURGE_LOCKFILE_SCRATCHPAD = '[Library action] Purge Lockfile Scratchpad'
export class PurgeLockfileScratchpad implements Action<LibraryBit> {
    readonly type = PURGE_LOCKFILE_SCRATCHPAD
    constructor(public bale: LibraryBit) {}
}

export const VALIDATE_LOCKFILE_SCRATCHPAD = '[Lockfile action] Validate Lockfile Scratchpad'
export class ValidateLockfileScratchpad implements Action<LibraryBit> {
    readonly type = VALIDATE_LOCKFILE_SCRATCHPAD
    constructor(public bale: LibraryBit) {}
}


export const RESOLVE_LOCKFILE_HUMAN_GATE = '[Lockfile action] Resolve Lockfile Human Gate'
export class ResolveLockfileHumanGate implements Action<LibraryBit> {
    readonly type = RESOLVE_LOCKFILE_HUMAN_GATE
    constructor(public bale: LibraryBit) {}
}


export const PROMOTE_LOCKFILE_SCRATCHPAD = '[Lockfile action] Promote Lockfile Scratchpad'
export class PromoteLockfileScratchpad implements Action<LibraryBit> {
    readonly type = PROMOTE_LOCKFILE_SCRATCHPAD
    constructor(public bale: LibraryBit) {}
}

export const MINT_LOCKFILE_LEDGER = '[Lockfile action] Mint Lockfile Ledger'
export class MintLockfileLedger implements Action<LibraryBit> {
    readonly type = MINT_LOCKFILE_LEDGER
    constructor(public bale: LibraryBit) {}
}


export const BUMP_FLEET_VERSION = '[Release action] Bump Fleet Version'
export class BumpFleetVersion implements Action<LibraryBit> {
    readonly type = BUMP_FLEET_VERSION
    constructor(public bale: LibraryBit) {}
}

export const CHECK_SOVEREIGNTY = '[Sovereignty action] Check Sovereignty'
export class CheckSovereignty implements Action<LibraryBit> {
    readonly type = CHECK_SOVEREIGNTY
    constructor(public bale: LibraryBit) {}
}

export const REWIRE_LIBRARY = '[Rewire action] Rewire Library'
export class RewireLibrary implements Action<LibraryBit> {
    readonly type = REWIRE_LIBRARY
    constructor(public bale: LibraryBit) {}
}

export const RESOLVE_FLEET_ROOT = '[Library action] Resolve Fleet Root'
export class ResolveFleetRoot implements Action<LibraryBit> {
    readonly type = RESOLVE_FLEET_ROOT
    constructor(public bale: LibraryBit) {}
}

export const SCAN_FLEET_PIVOTS = '[Library action] Scan Fleet Pivots'
export class ScanFleetPivots implements Action<LibraryBit> {
    readonly type = SCAN_FLEET_PIVOTS
    constructor(public bale: LibraryBit) {}
}

export const HYDRATE_PIVOT_MODULES = '[Library action] Hydrate Pivot Modules'
export class HydratePivotModules implements Action<LibraryBit> {
    readonly type = HYDRATE_PIVOT_MODULES
    constructor(public bale: LibraryBit) {}
}

export const DISCOVER_FLEET_PIVOTS = '[Library action] Discover Fleet Pivots'
export class DiscoverFleetPivots implements Action<LibraryBit> {
    readonly type = DISCOVER_FLEET_PIVOTS
    constructor(public bale: LibraryBit) {}
}

export const BOOT_SWITCHBOARD = '[Library action] Boot Switchboard'
export class BootSwitchboard implements Action<LibraryBit> {
    readonly type = BOOT_SWITCHBOARD
    constructor(public bale: LibraryBit) {}
}

export const CHECK_WORKER_BRIDGE = '[Library action] Check Worker Bridge'
export class CheckWorkerBridge implements Action<LibraryBit> {
    readonly type = CHECK_WORKER_BRIDGE
    constructor(public bale: LibraryBit) {}
}

export const TOGGLE_WORKER_BRIDGE = '[Library action] Toggle Worker Bridge'
export class ToggleWorkerBridge implements Action<LibraryBit> {
    readonly type = TOGGLE_WORKER_BRIDGE
    constructor(public bale: LibraryBit) {}
}

export type Actions =
    | CheckGitWorkingTree
    | ProgressLibrarySaga
    | InitLibrary
    | UpdateLibrary
    | ListLibrary
    | ProgressLibrary
    | ScanLibrary
    | ScanFleet
    | LaunchLibrary
    | FlatLibrary
    | AuditLibrary
    | OpenHumanSaveGate
    | StageLockfileConflict
    | PurgeLockfileScratchpad
    | ValidateLockfileScratchpad
    | ResolveLockfileHumanGate
    | PromoteLockfileScratchpad
    | MintLockfileLedger
    | BumpFleetVersion
    | CheckSovereignty
    | RewireLibrary
    | ResolveFleetRoot
    | ScanFleetPivots
    | HydratePivotModules
    | DiscoverFleetPivots
    | BootSwitchboard
    | CheckWorkerBridge
    | ToggleWorkerBridge

