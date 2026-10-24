import type Menu from './fce/menu.interface'
import MenuBit from './fce/menu.interface'

let _menuRoutes = new Map<string, Function>()
let _menuRouteDescriptions = new Map<string, string>()

export class MenuModel implements Menu {
    lst: string[] = []

    get menuRoutes(): Map<string, Function> {
        return _menuRoutes
    }
    set menuRoutes(val: Map<string, Function>) {
        _menuRoutes = val
    }

    get menuRouteDescriptions(): Map<string, string> {
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
