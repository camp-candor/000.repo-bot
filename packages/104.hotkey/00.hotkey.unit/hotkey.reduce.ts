import clone from 'clone-deep'
import * as Act from './hotkey.action.js'
import { HotkeyModel } from './hotkey.model.js'
import * as Buzz from './hotkey.buzzer.js'
import State from '../99.core/state.js'

export function reducer(
    model: HotkeyModel = new HotkeyModel(),
    act: Act.Actions,
    state?: State,
) {
    switch (act.type) {
        case Act.UPDATE_HOTKEY:
            return Buzz.updateHotkey(clone(model), act.bale, state)

        case Act.INIT_HOTKEY:
            return Buzz.initHotkey(clone(model), act.bale, state)

        case Act.TEST_HOTKEY:
            return Buzz.testHotkey(clone(model), act.bale, state)

        case Act.LIST_HOTKEY:
            return Buzz.listHotkey(clone(model), act.bale, state)

        case Act.EXECUTE_HOTKEY:
            return Buzz.executeHotkey(clone(model), act.bale, state)

        default:
            return model
    }
}
