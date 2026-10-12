import type NetBit from '../../81.grid.unit/fce/net.bit'

export default interface ChoiceBit<
    TDat = {
        clr0?: string
        clr1?: string
        cb?: (choice: string) => void
        [key: string]: any
    },
    TLst = string,
> {
    idx?: string
    src?: string
    clr?: string
    lst?: TLst[]
    val?: number
    dat?: TDat
    slv?: (result: { chcBit: Partial<ChoiceBit<TDat, TLst>> }) => void
    net?: NetBit
}
