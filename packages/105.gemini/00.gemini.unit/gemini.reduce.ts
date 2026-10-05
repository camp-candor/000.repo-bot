import clone from 'clone-deep'
import * as Act from './gemini.action.js'
import { GeminiModel } from './gemini.model.js'
import * as Buzz from './gemini.buzzer.js'
import State from '../99.core/state.js'

export function reducer(
    model: GeminiModel = new GeminiModel(),
    act: Act.Actions,
    state?: State,
) {
    switch (act.type) {
        case Act.UPDATE_GEMINI:
            return Buzz.updateGemini(clone(model), act.bale, state)

        case Act.INIT_GEMINI:
            return Buzz.initGemini(clone(model), act.bale, state)

        case Act.TEST_GEMINI:
            return Buzz.testGemini(clone(model), act.bale, state)

        case Act.LIST_GEMINI:
            return Buzz.listGemini(clone(model), act.bale, state)

        case Act.OPEN_GEMINI:
            return Buzz.openGemini(clone(model), act.bale, state)

        default:
            return model
    }
}
