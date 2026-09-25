import { Action } from '../99.core/interface/action.interface.js'
import ProjectBit from './fce/project.bit.js'

export const INIT_PROJECT = '[Project action] Init Project'
export class InitProject implements Action {
    readonly type = INIT_PROJECT
    constructor(public bale: ProjectBit) {}
}

export const WRITE_PROJECT = '[Project action] Write Project'
export class WriteProject implements Action {
    readonly type = WRITE_PROJECT
    constructor(public bale: ProjectBit) {}
}

export const UPDATE_PROJECT = '[Project action] Update Project'
export class UpdateProject implements Action {
    readonly type = UPDATE_PROJECT
    constructor(public bale: ProjectBit) {}
}

export const CREATE_PROJECT = '[Project action] Create Project'
export class CreateProject implements Action {
    readonly type = CREATE_PROJECT
    constructor(public bale: ProjectBit) {}
}

export const READ_PROJECT = '[Project action] Read Project'
export class ReadProject implements Action {
    readonly type = READ_PROJECT
    constructor(public bale: ProjectBit) {}
}

export const DELETE_PROJECT = '[Project action] Delete Project'
export class DeleteProject implements Action {
    readonly type = DELETE_PROJECT
    constructor(public bale: ProjectBit) {}
}

export const REMOVE_PROJECT = '[Project action] Remove Project'
export class RemoveProject implements Action {
    readonly type = REMOVE_PROJECT
    constructor(public bale: ProjectBit) {}
}

export type Actions =
    | InitProject
    | UpdateProject
    | CreateProject
    | ReadProject
    | DeleteProject
    | RemoveProject
    | WriteProject
