export default interface MenuBit<TDat = unknown, TLst = string> {
    idx?: string;
    src?: string;
    lst?: TLst[];
    val?: number;
    dat?: TDat;
    fnc?: Function;
    slv?: (result: { mnuBit: Partial<MenuBit<TDat, TLst>> }) => void;
}
