import clone from 'clone-deep'
import * as Act from './menu.action'
import { MenuModel } from './menu.model'
import * as Buzz from './menu.buzzer'
import type State from '../99.core/state'

function cloneMenuModel(model: MenuModel): MenuModel {
    const next = clone(model, true) as MenuModel
    next.menuRoutes = new Map(model.menuRoutes)
    next.menuRouteDescriptions = new Map(model.menuRouteDescriptions)
    return next
}

export function reducer(
    model: MenuModel = new MenuModel(),
    act: Act.Actions,
    state?: State,
) {
    switch (act.type) {
        case Act.UPDATE_MENU:
            return Buzz.updateMenu(cloneMenuModel(model), act.bale, state)

        case Act.INIT_MENU:
            return Buzz.initMenu(cloneMenuModel(model), act.bale, state)

        case Act.OPEN_MENU:
            return Buzz.openMenu(cloneMenuModel(model), act.bale, state)

        case Act.CLOSE_MENU:
            return Buzz.closeMenu(cloneMenuModel(model), act.bale, state)

        case Act.PRINT_MENU:
            return Buzz.printMenu(cloneMenuModel(model), act.bale, state)

        case Act.LIBRARY_MENU:
            return Buzz.libraryMenu(cloneMenuModel(model), act.bale, state)

        case Act.ROUTE_MENU:
            return Buzz.routeMenu(cloneMenuModel(model), act.bale as any, state)

        case Act.JUMP_PIVOT:
            return Buzz.jumpPivot(cloneMenuModel(model), act.bale, state)

        case Act.FLEET_MENU:
            return Buzz.fleetMenu(cloneMenuModel(model), act.bale, state)

        case Act.SAGA_TORN_STATE_MENU:
            return Buzz.sagaTornStateMenu(cloneMenuModel(model), act.bale, state)

        default:
            return model
    }
}
