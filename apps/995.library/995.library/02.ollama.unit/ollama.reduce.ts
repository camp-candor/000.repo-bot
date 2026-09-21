import clone from 'clone-deep'
import * as Act from './ollama.action'
import { OllamaModel } from './ollama.model'
import * as Buzz from './ollama.buzzer'
import type State from '../99.core/state'

export function reducer(
    model: OllamaModel = new OllamaModel(),
    act: Act.Actions,
    state?: State,
) {
    switch (act.type) {
        case Act.UPDATE_OLLAMA:
            return Buzz.updateOllama(clone(model), act.bale, state)

        case Act.INIT_OLLAMA:
            return Buzz.initOllama(clone(model), act.bale, state)

        case Act.WRITE_OLLAMA:
            return Buzz.writeOllama(clone(model), act.bale, state)

        case Act.INPUT_OLLAMA:
            return Buzz.inputOllama(clone(model), act.bale, state)

        default:
            return model
    }
}
