export default interface TerminalBit<TDat = unknown, TLst = unknown> {
    idx: string;
    src?: string;
    lst?: TLst[];
    val?: number;
    dat?: TDat;
    slv?: (result: { trmBit: Partial<TerminalBit<TDat, TLst>> }) => void;
}
