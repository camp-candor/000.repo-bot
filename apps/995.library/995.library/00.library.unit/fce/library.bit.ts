export default interface LibraryBit<TDat = unknown, TLst = string> {
    idx: string
    src?: string
    lst?: TLst[]
    val?: number
    dat?: TDat
    slv?: (result: { libBit: Partial<LibraryBit<TDat, TLst>> }) => void
}
