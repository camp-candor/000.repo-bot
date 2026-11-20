export interface SessionContextPayload {
    readonly activePivotTitle?: string;
    readonly activeSeriesSlug?: string;
    readonly canonSealHash?: string;
    readonly hostRigRole?: string;
    readonly hudVisible?: boolean;
}

export default interface TerminalBit<TDat = unknown, TLst = unknown> {
    idx: string;
    src?: string;
    lst?: TLst[];
    val?: number;
    dat?: TDat;
    activePivotTitle?: string;
    activeSeriesSlug?: string;
    canonSealHash?: string;
    hostRigRole?: string;
    hudVisible?: boolean;
    slv?: (result: { trmBit: Partial<TerminalBit<TDat, TLst>> }) => void;
}
