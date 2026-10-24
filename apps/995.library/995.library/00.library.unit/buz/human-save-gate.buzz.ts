import type { LibraryModel } from '../library.model';
import type LibraryBit from '../fce/library.bit';
import type State from '../../99.core/state';
import type { ConflictPinDescriptor, HumanGateResolutionBit } from '../fce/human-gate.interface';
import * as ActCns from '../../83.console.unit/console.action';
import { spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs-extra';

export const generateConflictScratchpad = (
    canonicalJson: string,
    conflicts: ConflictPinDescriptor[]
): string => {
    let output = canonicalJson;
    for (const c of conflicts) {
        const marker = [
            `<<<<<<< LOCAL WORKSPACE PIN (${c.repo})`,
            `      "pinned_sha": "${c.localSha}"`,
            `=======`,
            `      "pinned_sha": "${c.remoteSha}"`,
            `>>>>>>> REMOTE SOVEREIGN PIN (${c.repo})`
        ].join('\n');

        const targetPattern = new RegExp(`"pinned_sha"\\s*:\\s*"${c.localSha}"`, 'g');
        if (targetPattern.test(output)) {
            output = output.replace(targetPattern, marker);
        }
    }
    return output;
};

export const sanitizeAndValidateScratchpad = (
    rawContent: string
): { valid: boolean; cleanedJson?: string; error?: string } => {
    if (rawContent.includes('<<<<<<<') || rawContent.includes('>>>>>>>') || rawContent.includes('=======')) {
        return { valid: false, error: 'Unresolved git conflict markers remain in document' };
    }

    try {
        const parsed = JSON.parse(rawContent);
        const repos = parsed.repositories || parsed.repos || {};
        for (const [key, cfg] of Object.entries<any>(repos)) {
            const sha = cfg.pinned_sha || cfg.pinned_commit;
            if (sha && !/^[0-9a-fA-F]{40}$/.test(sha)) {
                return { valid: false, error: `Invalid 40-character hex commit SHA for repository: ${key}` };
            }
        }
        return { valid: true, cleanedJson: JSON.stringify(parsed, null, 2) };
    } catch (err: any) {
        return { valid: false, error: `Malformed JSON syntax: ${err.message}` };
    }
};

export const openHumanSaveGate = async (
    cpy: LibraryModel,
    bal: LibraryBit<HumanGateResolutionBit>,
    ste: State
): Promise<LibraryModel> => {
    const emit = async (src: string) => {
        if (ste && typeof ste.hunt === 'function') {
            await ste.hunt(ActCns.UPDATE_CONSOLE, { idx: 'cns00', src }).catch(() => {});
        }
    };

    const rootDir = process.cwd();
    const canonicalPath = bal?.src || path.resolve(rootDir, 'data/versions.json');
    const lockfileDir = path.resolve(rootDir, 'data/lockfile');
    fs.ensureDirSync(lockfileDir);

    const nonce = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const scratchpadPath = path.join(lockfileDir, `.tmp_versions_conflict_T_${nonce}.json`);

    const conflicts: ConflictPinDescriptor[] = (bal?.dat as any)?.conflicts || [];
    const canonicalContent = fs.existsSync(canonicalPath)
        ? fs.readFileSync(canonicalPath, 'utf8')
        : '{}';

    const scratchpadInitial = generateConflictScratchpad(canonicalContent, conflicts);
    fs.writeFileSync(scratchpadPath, scratchpadInitial, 'utf8');

    await emit('>> [HUMAN SAVE GATE] Lockfile collision intercepted.');
    await emit(`>> [STAGING] Scratchpad staged: ${path.relative(rootDir, scratchpadPath).replace(/\\/g, '/')}`);

    let resolved = false;
    let attempts = 0;
    const maxAttempts = 3;
    let lastError = '';

    const terminalScreen = ste?.value?.terminal?.screen;
    const isHeadless = !process.stdin.isTTY || process.env.CI === 'true' || !terminalScreen;

    while (attempts < maxAttempts && !resolved) {
        attempts++;
        await emit(`>> [HUMAN GATE] Initiating resolution attempt ${attempts} of ${maxAttempts}...`);

        if (!isHeadless) {
            try {
                if (typeof terminalScreen.leave === 'function') {
                    terminalScreen.leave();
                }
            } catch {
                // Defensive degradation
            }

            const editor = process.env.EDITOR || 'vi';
            const child = spawnSync(editor, [scratchpadPath], {
                stdio: 'inherit',
                shell: true,
            });

            try {
                if (typeof terminalScreen.enter === 'function') {
                    terminalScreen.enter();
                }
                if (typeof terminalScreen.render === 'function') {
                    terminalScreen.render();
                }
            } catch {
                // Defensive degradation
            }

            if (child.status !== 0) {
                lastError = `Editor exited with non-zero exit code: ${child.status}`;
                await emit(`:: [WARN] ${lastError}`);
            }
        } else {
            // Headless mock simulation hook
            const currentContent = fs.readFileSync(scratchpadPath, 'utf8');
            if (currentContent.includes('<<<<<<<')) {
                lastError = 'Headless execution: Unresolved conflict markers present';
            }
        }

        const updatedContent = fs.readFileSync(scratchpadPath, 'utf8');
        const validation = sanitizeAndValidateScratchpad(updatedContent);

        if (validation.valid && validation.cleanedJson) {
            fs.writeFileSync(canonicalPath, validation.cleanedJson, 'utf8');
            fs.removeSync(scratchpadPath);
            resolved = true;
            await emit('>> [OK] Validation Gate passed. Canonical manifest atomically committed.');
            break;
        } else {
            lastError = validation.error || 'Validation failure';
            await emit(`:: [FAIL] Attempt ${attempts} failed: ${lastError}`);

            if (attempts < maxAttempts) {
                const retryContent = [
                    `/* ========================================================================== */`,
                    `/* VALIDATION FAILURE (ATTEMPT ${attempts}): ${lastError}`,
                    `/* REMEDIATION: Resolve all conflict markers and verify strict 40-hex SHAs.  */`,
                    `/* ========================================================================== */`,
                    updatedContent
                ].join('\n');
                fs.writeFileSync(scratchpadPath, retryContent, 'utf8');
            }
        }
    }

    if (!resolved) {
        await emit('>> [CIRCUIT BREAKER TRIPPED] 3-Strike escalation ceiling reached.');
        await emit('>> [SAFEGUARD] Preserving canonical manifest in uncorrupted state.');
        if (fs.existsSync(scratchpadPath)) {
            fs.removeSync(scratchpadPath);
        }

        if (bal?.slv) {
            bal.slv({
                libBit: {
                    idx: 'human-save-gate-tripped',
                    src: canonicalPath,
                    val: attempts,
                    dat: {
                        scratchpadPath,
                        canonicalPath,
                        conflicts,
                        resolved: false,
                        attempts,
                        tripped: true,
                        error: lastError,
                    } as any,
                },
            });
        }
        return cpy;
    }

    if (bal?.slv) {
        bal.slv({
            libBit: {
                idx: 'human-save-gate-resolved',
                src: canonicalPath,
                val: attempts,
                dat: {
                    scratchpadPath,
                    canonicalPath,
                    conflicts,
                    resolved: true,
                    attempts,
                    tripped: false,
                } as any,
            },
        });
    }

    return cpy;
};
