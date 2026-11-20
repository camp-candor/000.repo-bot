export type PivotMenuRouteHandler = (slv?: (val?: any) => void) => Promise<any>;

export interface RouteMenuPayload {
    readonly menuTitle: string;
    readonly menuDesc?: string;
    readonly globalKey?: string;
    readonly fnc?: PivotMenuRouteHandler;
}

export interface JumpPivotPayload {
    readonly targetGlobalKey?: string;
    readonly targetMenuTitle?: string;
}

export default interface MenuBit<TDat = unknown, TLst = string> {
    idx?: string;
    src?: string;
    lst?: TLst[];
    val?: number;
    dat?: TDat;
    fnc?: PivotMenuRouteHandler;
    menuTitle?: string;
    menuDesc?: string;
    globalKey?: string;
    targetGlobalKey?: string;
    targetMenuTitle?: string;
    slv?: (result: { mnuBit: Partial<MenuBit<TDat, TLst>> }) => void;
}
