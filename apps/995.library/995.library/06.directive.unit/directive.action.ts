import type { Action } from '../99.core/interface/action.interface'
import type DirectiveBit from './fce/directive.bit'

export const INIT_DIRECTIVE = '[Directive action] Init Directive'
export class InitDirective implements Action<DirectiveBit> {
    readonly type = INIT_DIRECTIVE
    constructor(public bale: DirectiveBit) {}
}

export const UPDATE_DIRECTIVE = '[Directive action] Update Directive'
export class UpdateDirective implements Action<DirectiveBit> {
    readonly type = UPDATE_DIRECTIVE
    constructor(public bale: DirectiveBit) {}
}

export const DAY_DIRECTIVE = '[Day action] Day Directive'
export class DayDirective implements Action<DirectiveBit> {
    readonly type = DAY_DIRECTIVE
    constructor(public bale: DirectiveBit) {}
}

export const CREATE_DIRECTIVE = '[Create action] Create Directive'
export class CreateDirective implements Action<DirectiveBit> {
    readonly type = CREATE_DIRECTIVE
    constructor(public bale: DirectiveBit) {}
}

export const PHASE_DIRECTIVE = '[Phase action] Phase Directive'
export class PhaseDirective implements Action<DirectiveBit> {
    readonly type = PHASE_DIRECTIVE
    constructor(public bale: DirectiveBit) {}
}

export type Actions =
    | InitDirective
    | UpdateDirective
    | DayDirective
    | CreateDirective
    | PhaseDirective
