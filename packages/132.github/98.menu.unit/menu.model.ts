import Menu from './fce/menu.interface.js'
import MenuBit from './fce/menu.interface.js'

export class MenuModel implements Menu {
    lst: string[] = []

    geoJsonNow: any
    atlasNow: any
    sizeNow: any = 0
    mapShape: string = 'none'
    mapNomNow: string = 'none'
    mapDimensions: string = 'none'

    shapeBit: any
}
