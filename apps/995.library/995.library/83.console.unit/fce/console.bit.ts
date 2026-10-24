import type TermBit from './term.bit'

export default interface ConsoleBit<TDat = TermBit, TLst = unknown> {
    idx: string;
    src?: string;
    lst?: TLst[];
    val?: number;
    dat?: TDat;
    slv?: (result: { cnsBit: Partial<ConsoleBit<TDat, TLst>> }) => void;
    net?: any;
    trm?: TermBit;
}
