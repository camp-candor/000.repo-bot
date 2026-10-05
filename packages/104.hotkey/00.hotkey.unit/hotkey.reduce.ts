import clone from 'clone-deep'
import * as Act from './hotkey.action.js'
import { HotkeyModel } from './hotkey.model.js'
import * as Buzz from './hotkey.buzzer.js'
import State from '../99.core/state'

export function reducer(
  model: HotkeyModel = new HotkeyModel(),
  act: Act.Actions,
  state?: State,
) {
  switch (act.type) {
    case Act.EXECUTE_HOTKEY:
      return Buzz.executeHotkey(clone(model), act.bale, state!)

    case Act.INIT_HOTKEY:
      return Buzz.initHotkey(clone(model), act.bale, state!)

    case Act.UPDATE_HOTKEY:
      return Buzz.updateHotkey(clone(model), act.bale, state!)

    default:
      return model
  }
}
