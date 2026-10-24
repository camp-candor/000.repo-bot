import clone from 'clone-deep'
import * as Act from './directive.action'
import { DirectiveModel } from './directive.model'
import * as Buzz from './directive.buzzer'
import type State from '../99.core/state'

export function reducer(
    model: DirectiveModel = new DirectiveModel(),
    act: Act.Actions,
    state?: State,
) {
    switch (act.type) {
        case Act.UPDATE_DIRECTIVE:
            return Buzz.updateDirective(clone(model, true), act.bale, state)

        case Act.INIT_DIRECTIVE:
            return Buzz.initDirective(clone(model, true), act.bale, state)

        case Act.DAY_DIRECTIVE:
            return Buzz.dayDirective(clone(model, true), act.bale, state)

        case Act.CREATE_DIRECTIVE:
            return Buzz.createDirective(clone(model, true), act.bale, state)

        case Act.PHASE_DIRECTIVE:
            return Buzz.phaseDirective(clone(model, true), act.bale, state)

        default:
            return model
    }
}
