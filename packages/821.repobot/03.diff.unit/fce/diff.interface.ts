import  DiffBit  from "./diff.bit.js";

export default interface Diff {
    idx: string;
    diffBitList: DiffBit[];
    diffBits: any;

    lastAuditPassed: boolean;
    lastViolationReason: string;
    lastUnapprovedFiles: readonly string[];
}
