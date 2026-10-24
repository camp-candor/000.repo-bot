export default interface PackageBit<TDat = unknown, TLst = string> {
    idx: string
    src?: string
    lst?: TLst[]
    val?: number
    dat?: TDat
    slv?: (result: { pkgBit: Partial<PackageBit<TDat, TLst>> }) => void
}
