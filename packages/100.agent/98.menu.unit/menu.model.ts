import Menu from './fce/menu.interface.js'
import { getBaseUrl } from '../src/cascade.js'

export class MenuModel implements Menu {
    lst: string[] = []
    targetMode: 'LIVE' | 'LOCAL' = 'LIVE'
    activeBaseUrl: string = getBaseUrl()
    localProcess: any = null

    geoJsonNow: any
    atlasNow: any
    sizeNow: any = 0
    mapShape: string = 'none'
    mapNomNow: string = 'none'
    mapDimensions: string = 'none'

    shapeBit: any
}
