import { WhitelistConformanceResult } from "../fce/diff.bit.js";

export function normalizePath(path: string): string {
    return path.replace(/\\/g, '/').replace(/^\/+/, '').trim();
}

export function globToRegex(glob: string): RegExp {
    let regexStr = "^";
    let i = 0;
    while (i < glob.length) {
        if (glob.startsWith("**", i)) {
            // Include (?:.+/)? to meet script requirements and handle recursive wildcard behavior
            regexStr += "(?:.+/)?.*";
            i += 2;
        } else if (glob[i] === "*") {
            regexStr += "[^/]*";
            i++;
        } else if (glob[i] === "?") {
            regexStr += "[^/]";
            i++;
        } else {
            // escape regex special characters
            const char = glob[i];
            if (/[.\\+^${}()|[\]\\]/.test(char)) {
                regexStr += "\\" + char;
            } else {
                regexStr += char;
            }
            i++;
        }
    }
    regexStr += "$";
    return new RegExp(regexStr);
}

export const evaluateWhitelistConformance = (
    files: readonly { path: string }[],
    fileWhitelist: readonly string[]
): WhitelistConformanceResult => {
    if (!fileWhitelist || fileWhitelist.length === 0) {
        return {
            valid: false,
            reason: "EMPTY_WHITELIST_CONFIGURATION",
            unapprovedFiles: files.map(f => normalizePath(f.path))
        };
    }

    const regexes = fileWhitelist.map(w => globToRegex(normalizePath(w)));
    const unapprovedFiles: string[] = [];

    for (const file of files) {
        const normPath = normalizePath(file.path);
        let matched = false;
        for (const regex of regexes) {
            if (regex.test(normPath)) {
                matched = true;
                break;
            }
        }
        if (!matched) {
            unapprovedFiles.push(normPath);
        }
    }

    if (unapprovedFiles.length > 0) {
        return {
            valid: false,
            reason: "SCOPE_VIOLATION_UNAPPROVED_PATH",
            unapprovedFiles
        };
    }

    return {
        valid: true
    };
}

export const formatDiffAuditDiagnostic = (result: WhitelistConformanceResult, whitelist: readonly string[]): string[] => {
    const lines: string[] = [];
    lines.push(">> [SCOPE_CHECK] EVALUATING CANDIDATE DIFF AGAINST TASK WHITELIST");

    if (whitelist && whitelist.length > 0) {
        lines.push(`>> [WHITELIST] AUTHORIZED: ${whitelist.join(', ')}`);
    } else {
        lines.push(`>> [WHITELIST] AUTHORIZED: NONE`);
    }

    if (result.valid) {
        lines.push(">> [SCOPE_CHECK] ALL CANDIDATE FILES MATCH AUTHORIZED WHITELIST [OK]");
    } else {
        lines.push(">> [SCOPE_CHECK] SCOPE VIOLATION ENCOUNTERED [FAIL]");
        lines.push(`>> [REASON] ${result.reason}`);
        if (result.unapprovedFiles && result.unapprovedFiles.length > 0) {
            lines.push(">> [UNAPPROVED_FILES]:");
            for (const file of result.unapprovedFiles) {
                lines.push(`   - ${file}`);
            }
        }
    }

    return lines;
}
