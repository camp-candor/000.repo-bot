import type CaboodleBit from './fce/caboodle.bit'
import type Collect from './fce/collect.interface'
import CollectBit from './fce/collect.interface'

export class CollectModel implements Collect {
    idx = '23.11.14'
    caboodleBitList: CaboodleBit[] = []
    caboodleBits: any = {}
}
