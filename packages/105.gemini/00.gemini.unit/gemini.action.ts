import { Action } from '../99.core/interface/action.interface.js'
import GeminiBit from './fce/gemini.bit.js'

// gemini actions

export const INIT_GEMINI = '[Gemini action] Init Gemini'
export class InitGemini implements Action {
    readonly type = INIT_GEMINI
    constructor(public bale: GeminiBit) {}
}

export const UPDATE_GEMINI = '[Gemini action] Update Gemini'
export class UpdateGemini implements Action {
    readonly type = UPDATE_GEMINI
    constructor(public bale: GeminiBit) {}
}

export const TEST_GEMINI = '[Test action] Test Gemini'
export class TestGemini implements Action {
    readonly type = TEST_GEMINI
    constructor(public bale: GeminiBit) {}
}

export const INTELLECT_GEMINI = '[Intellect action] Intellect Gemini'
export class IntellectGemini implements Action {
    readonly type = INTELLECT_GEMINI
    constructor(public bale: GeminiBit) {}
}

export const VISION_GEMINI = '[Vision action] Vision Gemini'
export class VisionGemini implements Action {
    readonly type = VISION_GEMINI
    constructor(public bale: GeminiBit) {}
}

export const LIST_GEMINI = '[List action] List Gemini'
export class ListGemini implements Action {
    readonly type = LIST_GEMINI
    constructor(public bale: GeminiBit) {}
}

export const OPEN_GEMINI = '[Open action] Open Gemini'
export class OpenGemini implements Action {
    readonly type = OPEN_GEMINI
    constructor(public bale: undefined) {}
}

export type Actions =
    | InitGemini
    | UpdateGemini
    | TestGemini
    | IntellectGemini
    | VisionGemini
    | ListGemini
    | OpenGemini
