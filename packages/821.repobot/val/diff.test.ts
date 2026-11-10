import { describe, it, expect } from "vitest";
import { evaluateWhitelistConformance, normalizePath, globToRegex, formatDiffAuditDiagnostic } from "../03.diff.unit/buz/diff.buzz.js";

describe("Diff Buzz Tests", () => {
    it("normalizePath", () => {
        expect(normalizePath("\\foo\\bar")).toBe("foo/bar");
        expect(normalizePath("///foo/bar")).toBe("foo/bar");
    });

    it("globToRegex", () => {
        const regex = globToRegex("packages/821.repobot/03.diff.unit/**");
        expect(regex.test("packages/821.repobot/03.diff.unit/buz/diff.buzz.ts")).toBe(true);
        expect(regex.test("packages/821.repobot/val/diff.test.ts")).toBe(false);
    });

    it("evaluateWhitelistConformance", () => {
        const result = evaluateWhitelistConformance(
            [{ path: "packages/821.repobot/03.diff.unit/buz/diff.buzz.ts" }, { path: ".github/workflows/deploy.yml" }],
            ["packages/821.repobot/03.diff.unit/**"]
        );
        expect(result.valid).toBe(false);
        expect(result.reason).toBe("SCOPE_VIOLATION_UNAPPROVED_PATH");
        expect(result.unapprovedFiles).toEqual([".github/workflows/deploy.yml"]);
    });

    it("formatDiffAuditDiagnostic", () => {
        const result = {
            valid: false,
            reason: "SCOPE_VIOLATION_UNAPPROVED_PATH",
            unapprovedFiles: [".github/workflows/deploy.yml", "package.json"]
        };
        const whitelist = ["packages/821.repobot/03.diff.unit/**"];
        const lines = formatDiffAuditDiagnostic(result, whitelist);
        expect(lines[0]).toBe(">> [SCOPE_CHECK] EVALUATING CANDIDATE DIFF AGAINST TASK WHITELIST");
        expect(lines[1]).toBe(">> [WHITELIST] AUTHORIZED: packages/821.repobot/03.diff.unit/**");
        expect(lines[2]).toBe(">> [SCOPE_CHECK] SCOPE VIOLATION ENCOUNTERED [FAIL]");
        expect(lines[3]).toBe(">> [REASON] SCOPE_VIOLATION_UNAPPROVED_PATH");
        expect(lines[4]).toBe(">> [UNAPPROVED_FILES]:");
        expect(lines[5]).toBe("   - .github/workflows/deploy.yml");
        expect(lines[6]).toBe("   - package.json");
    });
});
