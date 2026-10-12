import clone from 'clone-deep'
import * as Act from './terminal.action'
import { TerminalModel } from './terminal.model'
import * as Buzz from './terminal.buzzer'
import type State from '../99.core/state'

export function reducer(
    model: TerminalModel = new TerminalModel(),
    act: Act.Actions,
    state?: State,
) {
    switch (act.type) {
        case Act.UPDATE_TERMINAL:
            return Buzz.updateTerminal(clone(model, true), act.bale, state)

        case Act.INIT_TERMINAL:
            return Buzz.initTerminal(clone(model, true), act.bale, state)

        case Act.RUN_TERMINAL:
            return Buzz.runTerminal(clone(model, true), act.bale, state)

        case Act.EDIT_TERMINAL:
            return Buzz.editTerminal(clone(model, true), act.bale, state)

        case Act.PRINT_TERMINAL:
            return Buzz.printTerminal(clone(model, true), act.bale, state)

        case Act.CLOSE_TERMINAL:
            return Buzz.closeTerminal(clone(model, true), act.bale, state)

        case Act.OPTION_TERMINAL:
            return Buzz.optionTerminal(clone(model, true), act.bale, state)

        case Act.OPEN_TERMINAL:
            return Buzz.openTerminal(clone(model, true), act.bale, state)

        case Act.INPUT_TERMINAL:
            return Buzz.inputTerminal(clone(model, true), act.bale, state)

        case Act.LAYOUT_TERMINAL:
            return Buzz.layoutTerminal(clone(model, true), act.bale, state)

        case Act.CLEAR_TERMINAL:
            return Buzz.clearTerminal(clone(model, true), act.bale, state)

        default:
            return model
    }
}
