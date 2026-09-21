import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'
import Menu from './fce/menu.interface.js'

try {
    let curr = process.cwd()
    while (curr && curr !== path.dirname(curr)) {
        const envCandidate = path.join(curr, '.env')
        if (fs.existsSync(envCandidate)) {
            dotenv.config({ path: envCandidate })
            break
        }
        curr = path.dirname(curr)
    }
} catch (e) {}

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
