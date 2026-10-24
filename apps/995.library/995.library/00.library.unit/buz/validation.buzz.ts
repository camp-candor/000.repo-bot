import { z } from 'zod'
import { promisify } from 'util'
import { execFile as execFileCb } from 'child_process'
import path from 'path'
import fs from 'fs-extra'
import type { LibraryModel } from '../library.model'
import type LibraryBit from '../fce/library.bit'
import type State from '../../99.core/state'
import type { VersionsManifest } from '../fce/versions.interface'
import type {
    ValidationGateFailure,
    ValidationGateReport,
    ValidationOptions,
} from '../fce/validation.interface'
import * as ActCns from '../../83.console.unit/console.action'

const execFile = promisify(execFileCb)

const STRICT_SEMVER_REGEX = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/
const COMMIT_SHA_40_REGEX = /^[0-9a-fA-F]{40}$/

export const PinnedRepoSchema = z.object({
    cluster: z.string().optional(),
    path: z.string().min(1, 'Repository path cannot be empty'),
    pinned_sha: z.string().regex(COMMIT_SHA_40_REGEX, 'pinned_sha must be a 40-character hexadecimal commit SHA'),
    required_contract_version: z.string().regex(STRICT_SEMVER_REGEX, 'required_contract_version must be strict SemVer (no ^, ~, or * wildcards)'),
    expected_branch: z.string().min(1, 'expected_branch must be specified'),
    status: z.enum(['LOCKED', 'UNMANAGED', 'STAGED']),
    dormant_by_design: z.boolean().optional(),
    boundary_dependencies: z.array(z.string()).optional(),
})

export const VersionsManifestSchema = z.object({
    $schema: z.string().optional(),
    schema_version: z.number().int().positive(),
    library_version: z.string().regex(STRICT_SEMVER_REGEX, 'library_version must be strict SemVer'),
    updated_at: z.string().min(1, 'updated_at timestamp required'),
    sovereign_repo: z.string().min(1, 'sovereign_repo required'),
    allow_periphery_broadcast: z.boolean(),
    shared_pivots: z.record(z.string()),
    repositories: z.record(PinnedRepoSchema),
})

/**
 * Strips C-style multi-line comments and single-line comments from conflict scratchpad text.
 */
export const stripConflictComments = (raw: string): string => {
    if (!raw) return ''

    // Remove multi-line comments /* ... */
    let stripped = raw.replace(/\/\*[\s\S]*?\*\//g, '')

    // Remove single-line comments // ... but preserve JSON string literal contents
    const lines = stripped.split('\n')
    const cleanedLines = lines.map((line) => {
        let insideString = false
        let escapeNext = false
        for (let i = 0; i < line.length; i++) {
            const char = line[i]
            if (escapeNext) {
                escapeNext = false
                continue
            }
            if (char === '\\') {
                escapeNext = true
                continue
            }
            if (char === '"') {
                insideString = !insideString
                continue
            }
            if (!insideString && char === '/' && line[i + 1] === '/') {
                return line.slice(0, i)
            }
        }
        return line
    })

    return cleanedLines.join('\n').trim()
}

/**
 * GATE 1: Syntactic parsing and strict Zod schema compliance.
 */
export const validateGate1Schema = (
    rawContent: string,
): { valid: boolean; manifest?: VersionsManifest; cleanedContent: string; failures: ValidationGateFailure[] } => {
    const failures: ValidationGateFailure[] = []
    const cleanedContent = stripConflictComments(rawContent)

    if (!cleanedContent) {
        failures.push({
            gate: 'GATE_1_SYNTAX_SCHEMA',
            message: 'Scratchpad content is empty after stripping conflict comments',
        })
        return { valid: false, cleanedContent, failures }
    }

    let parsed: any
    try {
        parsed = JSON.parse(cleanedContent)
    } catch (err: any) {
        failures.push({
            gate: 'GATE_1_SYNTAX_SCHEMA',
            message: `JSON syntax error: ${err.message}`,
        })
        return { valid: false, cleanedContent, failures }
    }

    const parseResult = VersionsManifestSchema.safeParse(parsed)
    if (!parseResult.success) {
        for (const issue of parseResult.error.issues) {
            const fieldPath = issue.path.join('.')
            failures.push({
                gate: 'GATE_1_SYNTAX_SCHEMA',
                field: fieldPath,
                message: `${fieldPath}: ${issue.message}`,
            })
        }
        return { valid: false, cleanedContent, failures }
    }

    return { valid: true, manifest: parseResult.data as VersionsManifest, cleanedContent, failures }
}

/**
 * GATE 2: CAS Commit Format & Git Object Reachability Audit.
 */
export const validateGate2CommitReachability = async (
    manifest: VersionsManifest,
    options: ValidationOptions = {},
): Promise<{ valid: boolean; failures: ValidationGateFailure[] }> => {
    const failures: ValidationGateFailure[] = []
    const checkReachability = options.checkGitReachability ?? false
    const fleetRoot = options.fleetRoot || process.cwd()

    for (const [repoKey, repoConfig] of Object.entries(manifest.repositories)) {
        if (!COMMIT_SHA_40_REGEX.test(repoConfig.pinned_sha)) {
            failures.push({
                gate: 'GATE_2_CAS_COMMIT',
                repo: repoKey,
                field: 'pinned_sha',
                message: `Repository [${repoKey}] commit SHA is not 40-character hexadecimal: ${repoConfig.pinned_sha}`,
            })
            continue
        }

        if (checkReachability) {
            const resolvedPath = path.isAbsolute(repoConfig.path)
                ? repoConfig.path
                : path.resolve(fleetRoot, repoConfig.path)

            if (await fs.pathExists(path.join(resolvedPath, '.git'))) {
                try {
                    await execFile('git', ['cat-file', '-e', repoConfig.pinned_sha], {
                        cwd: resolvedPath,
                        timeout: 3000,
                    })
                } catch {
                    failures.push({
                        gate: 'GATE_2_CAS_COMMIT',
                        repo: repoKey,
                        field: 'pinned_sha',
                        message: `Commit ${repoConfig.pinned_sha.slice(0, 7)} unreachable in git store of ${repoConfig.path}`,
                    })
                }
            }
        }
    }

    return { valid: failures.length === 0, failures }
}

/**
 * GATE 3: Monotonic Compatibility & Fleet SAT Evaluation.
 */
export const validateGate3MonotonicCompatibility = (
    manifest: VersionsManifest,
): { valid: boolean; failures: ValidationGateFailure[] } => {
    const failures: ValidationGateFailure[] = []
    const canonicalLibVersion = manifest.library_version
    const sharedPivots = manifest.shared_pivots || {}

    // 1. Assert shared pivot versions use strict SemVer
    for (const [pivotKey, pivotVer] of Object.entries(sharedPivots)) {
        if (!STRICT_SEMVER_REGEX.test(pivotVer)) {
            failures.push({
                gate: 'GATE_3_MONOTONIC_SAT',
                field: `shared_pivots.${pivotKey}`,
                message: `Shared pivot [${pivotKey}] version must be strict SemVer: ${pivotVer}`,
            })
        }
    }

    // 2. Cross-repository dependency compatibility check
    for (const [repoKey, repoConfig] of Object.entries(manifest.repositories)) {
        if (repoConfig.status === 'LOCKED' && repoConfig.required_contract_version !== canonicalLibVersion) {
            failures.push({
                gate: 'GATE_3_MONOTONIC_SAT',
                repo: repoKey,
                field: 'required_contract_version',
                message: `Repository [${repoKey}] is LOCKED but required_contract_version (${repoConfig.required_contract_version}) differs from sovereign library_version (${canonicalLibVersion})`,
            })
        }

        if (repoConfig.boundary_dependencies) {
            for (const dep of repoConfig.boundary_dependencies) {
                if (!manifest.repositories[dep] && !sharedPivots[dep]) {
                    failures.push({
                        gate: 'GATE_3_MONOTONIC_SAT',
                        repo: repoKey,
                        field: 'boundary_dependencies',
                        message: `Repository [${repoKey}] specifies missing boundary dependency: [${dep}]`,
                    })
                }
            }
        }
    }

    return { valid: failures.length === 0, failures }
}

/**
 * Orchestrator: Dispatches raw or file scratchpad through the Three-Tier Gauntlet.
 */
export const validateLockfileScratchpad = async (
    cpy: LibraryModel,
    bal: LibraryBit,
    ste: State,
): Promise<LibraryModel> => {
    const emit = async (src: string) => {
        if (ste && typeof ste.hunt === 'function') {
            await ste.hunt(ActCns.UPDATE_CONSOLE, { idx: 'cns00', src }).catch(() => {})
        }
    }

    try {
        let content = ''
        const targetPath = bal?.src || ''

        if (bal?.dat && typeof (bal.dat as any).content === 'string') {
            content = (bal.dat as any).content
        } else if (targetPath && (await fs.pathExists(targetPath))) {
            content = await fs.readFile(targetPath, 'utf8')
        } else {
            throw new Error(`Target scratchpad file not found: ${targetPath}`)
        }

        await emit('>> [VALIDATION] Commencing Three-Tier Validation Gauntlet...')

        // Tier 1: Syntax & Schema
        const gate1 = validateGate1Schema(content)
        if (!gate1.valid || !gate1.manifest) {
            await emit(`:: [VALIDATION:GATE_1] [FAIL] Schema check failed with ${gate1.failures.length} error(s)`)
            const report: ValidationGateReport = {
                valid: false,
                gate1Passed: false,
                gate2Passed: false,
                gate3Passed: false,
                failures: gate1.failures,
                cleanedContent: gate1.cleanedContent,
                timestamp: new Date().toISOString(),
            }
            if (bal?.slv) {
                bal.slv({
                    libBit: {
                        idx: 'validate-lockfile-scratchpad-fail',
                        val: gate1.failures.length,
                        dat: report,
                        src: targetPath,
                    },
                })
            }
            return cpy
        }
        await emit('>> [VALIDATION:GATE_1] [OK] Syntactic & Zod schema validation passed.')

        // Tier 2: CAS Commit Format & Git Reachability
        const opts: ValidationOptions = (bal?.dat as any)?.options || {}
        const gate2 = await validateGate2CommitReachability(gate1.manifest, opts)
        if (!gate2.valid) {
            await emit(`:: [VALIDATION:GATE_2] [FAIL] CAS audit failed with ${gate2.failures.length} error(s)`)
            const report: ValidationGateReport = {
                valid: false,
                gate1Passed: true,
                gate2Passed: false,
                gate3Passed: false,
                failures: gate2.failures,
                manifest: gate1.manifest,
                cleanedContent: gate1.cleanedContent,
                timestamp: new Date().toISOString(),
            }
            if (bal?.slv) {
                bal.slv({
                    libBit: {
                        idx: 'validate-lockfile-scratchpad-fail',
                        val: gate2.failures.length,
                        dat: report,
                        src: targetPath,
                    },
                })
            }
            return cpy
        }
        await emit('>> [VALIDATION:GATE_2] [OK] CAS commit digests verified.')

        // Tier 3: Monotonic Compatibility
        const gate3 = validateGate3MonotonicCompatibility(gate1.manifest)
        if (!gate3.valid) {
            await emit(`:: [VALIDATION:GATE_3] [FAIL] Fleet compatibility check failed with ${gate3.failures.length} error(s)`)
            const report: ValidationGateReport = {
                valid: false,
                gate1Passed: true,
                gate2Passed: true,
                gate3Passed: false,
                failures: gate3.failures,
                manifest: gate1.manifest,
                cleanedContent: gate1.cleanedContent,
                timestamp: new Date().toISOString(),
            }
            if (bal?.slv) {
                bal.slv({
                    libBit: {
                        idx: 'validate-lockfile-scratchpad-fail',
                        val: gate3.failures.length,
                        dat: report,
                        src: targetPath,
                    },
                })
            }
            return cpy
        }
        await emit('>> [VALIDATION:GATE_3] [OK] Fleet monotonic compatibility satisfied.')

        const report: ValidationGateReport = {
            valid: true,
            gate1Passed: true,
            gate2Passed: true,
            gate3Passed: true,
            failures: [],
            manifest: gate1.manifest,
            cleanedContent: gate1.cleanedContent,
            timestamp: new Date().toISOString(),
        }

        await emit('>> [VALIDATION] [OK] Three-Tier Gauntlet Cleared: Ready for atomic promotion.')

        if (bal?.slv) {
            bal.slv({
                libBit: {
                    idx: 'validate-lockfile-scratchpad',
                    val: 0,
                    dat: report,
                    src: targetPath,
                },
            })
        }
    } catch (err: any) {
        await emit(`:: [VALIDATION] [ERR] ${err.message}`)
        if (bal?.slv) {
            bal.slv({
                libBit: {
                    idx: 'validate-lockfile-scratchpad-error',
                    src: err.message,
                    val: -1,
                },
            })
        }
    }

    return cpy
}
