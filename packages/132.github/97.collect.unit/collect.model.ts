import CaboodleBit from './fce/caboodle.bit.js'
import Collect from './fce/collect.interface.js'
import CollectBit from './fce/collect.interface.js'

export class CollectModel implements Collect {
    idx: string = '23.11.14'
    caboodleBitList: CaboodleBit[] = []
    caboodleBits: any = {}
}
