export default interface InputBit<
    TDat = { clr0?: string; clr1?: string; [key: string]: any },
    TLst = string,
> {
    idx?: string
    src?: string
    lst?: TLst[]
    val?: number
    txt?: string
    dat?: TDat
    net?: any
    slv?: (result: { putBit: Partial<InputBit<TDat, TLst>> }) => void
}
