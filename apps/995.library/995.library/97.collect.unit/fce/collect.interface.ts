import CollectBit from './collect.bit'
import type CaboodleBit from './caboodle.bit'

export default interface Collect {
    idx: string
    caboodleBitList: CaboodleBit[]
    caboodleBits: any
}
