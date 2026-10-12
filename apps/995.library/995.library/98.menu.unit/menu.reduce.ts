import clone from 'clone-deep'
import * as Act from './menu.action'
import { MenuModel } from './menu.model'
import * as Buzz from './menu.buzzer'
import type State from '../99.core/state'

export function reducer(
    model: MenuModel = new MenuModel(),
    act: Act.Actions,
    state?: State,
) {
    switch (act.type) {
        case Act.UPDATE_MENU:
            return Buzz.updateMenu(clone(model, true), act.bale, state)

        case Act.INIT_MENU:
            return Buzz.initMenu(clone(model, true), act.bale, state)

        case Act.OPEN_MENU:
            return Buzz.openMenu(clone(model, true), act.bale, state)

        case Act.CLOSE_MENU:
            return Buzz.closeMenu(clone(model, true), act.bale, state)

        case Act.PRINT_MENU:
            return Buzz.printMenu(clone(model, true), act.bale, state)

        case Act.LIBRARY_MENU:
            return Buzz.libraryMenu(clone(model, true), act.bale, state)

        case Act.ROUTE_MENU:
            return Buzz.routeMenu(clone(model, true), act.bale, state)

        case Act.FLEET_MENU:
            return Buzz.fleetMenu(clone(model, true), act.bale, state)

        case Act.SAGA_TORN_STATE_MENU:
            return Buzz.sagaTornStateMenu(clone(model, true), act.bale, state)

        default:
            return model
    }
}
