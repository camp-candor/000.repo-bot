import type { Action } from '../99.core/interface/action.interface'
import type OllamaBit from './fce/ollama.bit'

// Ollama actions

export const INIT_OLLAMA = '[Ollama action] Init Ollama'
export class InitOllama implements Action {
    readonly type = INIT_OLLAMA
    constructor(public bale: OllamaBit) {}
}

export const UPDATE_OLLAMA = '[Ollama action] Update Ollama'
export class UpdateOllama implements Action {
    readonly type = UPDATE_OLLAMA
    constructor(public bale: OllamaBit) {}
}

export const WRITE_OLLAMA = '[Write action] Write Ollama'
export class WriteOllama implements Action {
    readonly type = WRITE_OLLAMA
    constructor(public bale: OllamaBit) {}
}

export const INPUT_OLLAMA = '[Input action] Input Ollama'
export class InputOllama implements Action {
    readonly type = INPUT_OLLAMA
    constructor(public bale: OllamaBit) {}
}

export type Actions = InitOllama | UpdateOllama | WriteOllama | InputOllama
