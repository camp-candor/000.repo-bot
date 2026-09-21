import type Gears from './fce/gears.interface'
import GearsBit from './fce/gears.interface'

export class GearsModel implements Gears {
    scale = 10
    seed = 92125
    dex = 0
    count = 1000
    srcDir: string = process.env.GEARS
    cacheDir: string = process.env.SEARCH
    loreDir: string = process.env.LORE
}
