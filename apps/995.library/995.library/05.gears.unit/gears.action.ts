import type { Action } from '../99.core/interface/action.interface'
import type GearsBit from './fce/gears.bit'

// Gears actions

export const INIT_GEARS = '[Gears action] Init Gears'
export class InitGears implements Action {
    readonly type = INIT_GEARS
    constructor(public bale: GearsBit) {}
}

export const UPDATE_GEARS = '[Gears action] Update Gears'
export class UpdateGears implements Action {
    readonly type = UPDATE_GEARS
    constructor(public bale: GearsBit) {}
}

export const TEST_GEARS = '[Test action] Test Gears'
export class TestGears implements Action {
    readonly type = TEST_GEARS
    constructor(public bale: GearsBit) {}
}

export const SEARCH_GEARS = '[Search action] Search Gears'
export class SearchGears implements Action {
    readonly type = SEARCH_GEARS
    constructor(public bale: GearsBit) {}
}

export const CREATE_GEARS = '[Create action] Create Gears'
export class CreateGears implements Action {
    readonly type = CREATE_GEARS
    constructor(public bale: GearsBit) {}
}

export const LORE_GEARS = '[Lore action] Lore Gears'
export class LoreGears implements Action {
    readonly type = LORE_GEARS
    constructor(public bale: GearsBit) {}
}

export type Actions =
    InitGears | UpdateGears | TestGears | SearchGears | CreateGears | LoreGears
