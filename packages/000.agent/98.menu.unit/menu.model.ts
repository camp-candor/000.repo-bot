import Menu from './fce/menu.interface.js'

const resolvedLiveUrl = (
    process.env.LIVE_WORKER_URL ||
    process.env.WORKER_URL ||
    'https://repo-bot-00.berad4000.workers.dev'
).replace(/\/$/, '')

export class MenuModel implements Menu {
    lst: string[] = []
    targetMode: 'LIVE' | 'LOCAL' = 'LIVE'
    activeBaseUrl: string = resolvedLiveUrl
    localProcess: any = null

    geoJsonNow: any
    atlasNow: any
    sizeNow: any = 0
    mapShape: string = 'none'
    mapNomNow: string = 'none'
    mapDimensions: string = 'none'

    shapeBit: any
}
