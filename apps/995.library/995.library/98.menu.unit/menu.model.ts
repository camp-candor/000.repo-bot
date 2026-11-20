import type Menu from './fce/menu.interface'
import MenuBit from './fce/menu.interface'
import type { PivotMenuRouteHandler } from './fce/menu.bit'

export const DEFAULT_LIBRARY_MENU_TITLE = 'LIBRARY MENU'
export const DEFAULT_LIBRARY_MENU_DESC =
    'Open the library menu to explore core 995.library harness status and fleet discovery.'

let _menuRoutes = new Map<string, PivotMenuRouteHandler>()
let _menuRouteDescriptions = new Map<string, string>([
    [DEFAULT_LIBRARY_MENU_TITLE, DEFAULT_LIBRARY_MENU_DESC],
])

export class MenuModel implements Menu {
    lst: string[] = []
    idx: string = '98.menu'
    activeMenuMode: 'ROOT' | 'SUBMENU' = 'ROOT'
    activeSessionTitle: string = 'MASTER SWITCHBOARD'
    pendingJumpTitle: string | null = null
    hudTelemetryVisible: boolean = true

    get menuRoutes(): Map<string, PivotMenuRouteHandler> {
        if (!_menuRouteDescriptions.has(DEFAULT_LIBRARY_MENU_TITLE)) {
            _menuRouteDescriptions.set(DEFAULT_LIBRARY_MENU_TITLE, DEFAULT_LIBRARY_MENU_DESC)
        }
        return _menuRoutes
    }
    set menuRoutes(val: Map<string, PivotMenuRouteHandler>) {
        _menuRoutes = val
    }

    get menuRouteDescriptions(): Map<string, string> {
        if (!_menuRouteDescriptions.has(DEFAULT_LIBRARY_MENU_TITLE)) {
            _menuRouteDescriptions.set(DEFAULT_LIBRARY_MENU_TITLE, DEFAULT_LIBRARY_MENU_DESC)
        }
        return _menuRouteDescriptions
    }
    set menuRouteDescriptions(val: Map<string, string>) {
        _menuRouteDescriptions = val
    }

    geoJsonNow: any
    atlasNow: any
    sizeNow: any = 0
    mapShape = 'none'
    mapNomNow = 'none'
    mapDimensions = 'none'

    shapeBit: any
}
