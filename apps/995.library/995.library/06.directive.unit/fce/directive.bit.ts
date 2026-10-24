export default interface DirectiveBit<TDat = unknown, TLst = string> {
    idx: string
    src?: string
    lst?: TLst[]
    val?: number
    dat?: TDat
    slv?: (result: {
        drtBit?: Partial<DirectiveBit<TDat, TLst>>
        dayBit?: Partial<DirectiveBit<TDat, TLst>>
        phaseBit?: Partial<DirectiveBit<TDat, TLst>>
    }) => void
}
