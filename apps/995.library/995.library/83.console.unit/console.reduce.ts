import clone from 'clone-deep'
import * as Act from './console.action'
import { ConsoleModel } from './console.model'
import * as Buzz from './console.buzzer'
import type State from '../99.core/state'

export function reducer(
    model: ConsoleModel = new ConsoleModel(),
    act: Act.Actions,
    state?: State,
) {
    switch (act.type) {
        case Act.UPDATE_CONSOLE:
            return Buzz.updateConsole(clone(model, true), act.bale, state)

        case Act.INIT_CONSOLE:
            return Buzz.initConsole(clone(model, true), act.bale, state)

        case Act.READ_CONSOLE:
            return Buzz.readConsole(clone(model, true), act.bale, state)

        case Act.WRITE_CONSOLE:
            return Buzz.writeConsole(clone(model, true), act.bale, state)

        case Act.REMOVE_CONSOLE:
            return Buzz.removeConsole(clone(model, true), act.bale, state)

        case Act.DELETE_CONSOLE:
            return Buzz.deleteConsole(clone(model, true), act.bale, state)

        case Act.CREATE_CONSOLE:
            return Buzz.createConsole(clone(model, true), act.bale, state)

        default:
            return model
    }
}
