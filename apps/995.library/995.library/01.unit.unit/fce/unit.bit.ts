export default interface UnitBit<TDat = unknown, TLst = string> {
    idx: string
    src?: string
    lst?: TLst[]
    val?: number
    dat?: TDat
    skipped?: boolean
    slv?: (result: { untBit: Partial<UnitBit<TDat, TLst>> }) => void
}
