import Diff from "./fce/diff.interface.js";
import DiffBit from "./fce/diff.bit.js";

export class DiffModel implements Diff {
    idx: string = '03.diff';
    diffBitList: DiffBit[] = [];
    diffBits: any = {};

    lastAuditPassed: boolean = true;
    lastViolationReason: string = 'NONE';
    lastUnapprovedFiles: readonly string[] = [];
}
