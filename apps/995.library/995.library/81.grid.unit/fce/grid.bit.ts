import type NetBit from './net.bit'

export default interface GridBit<TDat = NetBit, TLst = unknown> {
    idx?: string;
    src?: string;
    lst?: TLst[];
    val?: number;
    dat?: TDat;
    slv?: (result: { grdBit: Partial<GridBit<TDat, TLst>> }) => void;
    x?: number;
    y?: number;
    xSpan?: number;
    ySpan?: number;
}
