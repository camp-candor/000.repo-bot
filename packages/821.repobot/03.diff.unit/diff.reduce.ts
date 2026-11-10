import clone from "clone-deep";
import * as Act from "./diff.action.js";
import { DiffModel } from "./diff.model.js";
import * as Buzz from "./buz/diff.buzz.js";

export function reducer(model: DiffModel = new DiffModel(), act: Act.Actions, state?: any) {
    switch (act.type) {
        case Act.INIT_DIFF:
            return model;

        case Act.UPDATE_DIFF:
            return model;

        case Act.AUDIT_PULL_REQUEST_DIFF: {
            return model;
        }

        case Act.DIFF_AUDIT_PASSED: {
            const nextModel = clone(model);
            nextModel.lastAuditPassed = true;
            nextModel.lastViolationReason = 'NONE';
            nextModel.lastUnapprovedFiles = [];
            return nextModel;
        }

        case Act.DIFF_AUDIT_REJECTED: {
            const nextModel = clone(model);
            nextModel.lastAuditPassed = false;
            nextModel.lastViolationReason = act.bale.whitelistResult?.reason || 'UNKNOWN';
            nextModel.lastUnapprovedFiles = act.bale.whitelistResult?.unapprovedFiles || [];
            return nextModel;
        }

        default:
            return model;
    }
}
