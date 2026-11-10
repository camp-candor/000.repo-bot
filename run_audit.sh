#!/bin/bash
checks_passed=0

# Check 1
if [ -z "$(git status -s apps/995.library/995.library/ 2>/dev/null)" ]; then
    ((checks_passed++))
    echo "Check 1: Passed"
else
    echo "Check 1: Failed"
fi

# Check 2
if test ! -d packages/821.repobot/src; then
    ((checks_passed++))
    echo "Check 2: Passed"
else
    echo "Check 2: Failed"
fi

# Check 3
if node -e "const fs = require('fs'); try { const s = fs.readFileSync('packages/821.repobot/03.diff.unit/fce/diff.bit.ts', 'utf8'); if (!s.includes('WhitelistConformanceResult') || !s.includes('fileWhitelist') || !s.includes('DiffFilePayload')) process.exit(1); } catch (e) { process.exit(1); }"; then
    ((checks_passed++))
    echo "Check 3: Passed"
else
    echo "Check 3: Failed"
fi

# Check 4
if node -e "const fs = require('fs'); try { const s = fs.readFileSync('packages/821.repobot/03.diff.unit/fce/diff.interface.ts', 'utf8'); if (!s.includes('lastAuditPassed') || !s.includes('lastUnapprovedFiles')) process.exit(1); } catch (e) { process.exit(1); }"; then
    ((checks_passed++))
    echo "Check 4: Passed"
else
    echo "Check 4: Failed"
fi

# Check 5
if node -e "const fs = require('fs'); try { const s = fs.readFileSync('packages/821.repobot/03.diff.unit/diff.action.ts', 'utf8'); if (!s.includes('AUDIT_PULL_REQUEST_DIFF') || !s.includes('DIFF_AUDIT_PASSED') || !s.includes('DIFF_AUDIT_REJECTED')) process.exit(1); } catch (e) { process.exit(1); }"; then
    ((checks_passed++))
    echo "Check 5: Passed"
else
    echo "Check 5: Failed"
fi

# Check 6
if node -e "const fs = require('fs'); try { const s = fs.readFileSync('packages/821.repobot/03.diff.unit/diff.model.ts', 'utf8'); if (!s.includes('lastUnapprovedFiles') || !s.includes(\"idx: string = '03.diff'\")) process.exit(1); } catch (e) { process.exit(1); }"; then
    ((checks_passed++))
    echo "Check 6: Passed"
else
    echo "Check 6: Failed"
fi

# Check 7
if node -e "const fs = require('fs'); try { const s = fs.readFileSync('packages/821.repobot/03.diff.unit/buz/diff.buzz.ts', 'utf8'); if (!s.includes('function normalizePath') || !s.includes(\".replace(/\\\\\\\\/g, '/'\")) process.exit(1); } catch (e) { process.exit(1); }"; then
    ((checks_passed++))
    echo "Check 7: Passed"
else
    echo "Check 7: Failed"
fi

# Check 8
if node -e "const fs = require('fs'); try { const s = fs.readFileSync('packages/821.repobot/03.diff.unit/buz/diff.buzz.ts', 'utf8'); if (!s.includes('function globToRegex') || !s.includes('(?:.+/)?')) process.exit(1); } catch (e) { process.exit(1); }"; then
    ((checks_passed++))
    echo "Check 8: Passed"
else
    echo "Check 8: Failed"
fi

# Check 9
if node -e "const fs = require('fs'); try { const s = fs.readFileSync('packages/821.repobot/03.diff.unit/buz/diff.buzz.ts', 'utf8'); if (!s.includes('evaluateWhitelistConformance') || !s.includes('SCOPE_VIOLATION_UNAPPROVED_PATH')) process.exit(1); } catch (e) { process.exit(1); }"; then
    ((checks_passed++))
    echo "Check 9: Passed"
else
    echo "Check 9: Failed"
fi

# Check 10
if node -e "const fs = require('fs'); try { const s = fs.readFileSync('packages/821.repobot/03.diff.unit/buz/diff.buzz.ts', 'utf8'); if (!s.includes('formatDiffAuditDiagnostic') || !s.includes('>> [SCOPE_CHECK]')) process.exit(1); } catch (e) { process.exit(1); }"; then
    ((checks_passed++))
    echo "Check 10: Passed"
else
    echo "Check 10: Failed"
fi

# Check 11
if node -e "const fs = require('fs'); try { const s = fs.readFileSync('packages/821.repobot/03.diff.unit/diff.reduce.ts', 'utf8'); if (!s.includes('clone-deep') || !s.includes('Act.AUDIT_PULL_REQUEST_DIFF')) process.exit(1); } catch (e) { process.exit(1); }"; then
    ((checks_passed++))
    echo "Check 11: Passed"
else
    echo "Check 11: Failed"
fi

# Check 12
if ! git grep -P "[\x{80}-\x{FF}]" packages/821.repobot/03.diff.unit/ packages/821.repobot/val/diff.test.ts >/dev/null 2>&1; then
    ((checks_passed++))
    echo "Check 12: Passed"
else
    echo "Check 12: Failed"
fi

# Check 13
if (cd packages/821.repobot && npx vitest run val/diff.test.ts >/dev/null 2>&1 && npm run check:types >/dev/null 2>&1); then
    ((checks_passed++))
    echo "Check 13: Passed"
else
    echo "Check 13: Failed"
fi

echo "Total checks passed: $checks_passed"
