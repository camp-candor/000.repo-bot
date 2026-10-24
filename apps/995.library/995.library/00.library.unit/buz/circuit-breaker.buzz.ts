import type { LibraryModel } from '../library.model'
import type LibraryBit from '../fce/library.bit'
import type State from '../../99.core/state'
import type { ValidationGateFailure, ValidationGateReport } from '../fce/validation.interface'
import type {
    CircuitBreakerClassification,
    CircuitBreakerDossier,
    HumanGateResolutionResult,
} from '../fce/circuit-breaker.interface'
import * as ActCns from '../../83.console.unit/console.action'
import * as ActTrm from '../../80.terminal.unit/terminal.action'
import * as ActLib from '../library.action'
import path from 'path'
import fs from 'fs-extra'

const ANNOTATION_HEADER_START = '/* =============================================================================='
const ANNOTATION_HEADER_END = '============================================================================== */'

/**
 * Injects in-place diagnostic error annotations at the top of the scratchpad file.
 * Strips previous error header blocks to avoid repetitive comment accumulation across cycles.
 */
export const annotateScratchpadWithErrors = async (
    scratchpadPath: string,
    failures: ValidationGateFailure[],
    attempt: number,
    maxAttempts = 3,
): Promise<string> => {
    let content = await fs.readFile(scratchpadPath, 'utf8')

    // Strip previous annotation header if present
    const startIdx = content.indexOf(ANNOTATION_HEADER_START)
    const endIdx = content.indexOf(ANNOTATION_HEADER_END)
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
        content = content.slice(endIdx + ANNOTATION_HEADER_END.length).trimStart()
    }

    const lines: string[] = [
        ANNOTATION_HEADER_START,
        `>> [VALIDATION FAILURE - ATTEMPT ${attempt} OF ${maxAttempts}]`,
        '>> Resolve the following error(s) in this file and save before closing editor:',
    ]

    failures.forEach((f, idx) => {
        const fieldStr = f.field ? ` (field: ${f.field})` : ''
        lines.push(`>>   ${idx + 1}. [${f.gate}]${fieldStr}: ${f.message}`)
    })

    lines.push(
        '>> Invariant: Strip invalid syntax and retain absolute SemVer for all version pins.',
        ANNOTATION_HEADER_END,
        '',
        content,
    )

    const updated = lines.join('\n')
    await fs.writeFile(scratchpadPath, updated, 'utf8')
    return updated
}

/**
 * Compiles a structured, forensic Diagnostic Escalation Dossier upon circuit breaker trip.
 */
export const compileCircuitBreakerDossier = (params: {
    operator?: string
    attempts: number
    failures: ValidationGateFailure[]
    canonicalPath: string
}): CircuitBreakerDossier => {
    const { operator = 'LOCAL_ARCHITECT', attempts, failures, canonicalPath } = params

    let failureClass: CircuitBreakerClassification = 'PERSISTENT_SCHEMA_VIOLATION'
    if (failures.some((f) => f.gate === 'GATE_2_CAS_COMMIT')) {
        failureClass = 'CAS_REACHABILITY_FAILURE'
    } else if (failures.some((f) => f.gate === 'GATE_3_MONOTONIC_SAT')) {
        failureClass = 'MONOTONIC_SAT_FAILURE'
    }

    const lastError = failures.length > 0
        ? failures.map((f) => f.message).join('; ')
        : 'Unknown validation anomaly'

    return {
        escalation_event: 'LOCKFILE_HUMAN_GATE_BREAKER_TRIPPED',
        timestamp: new Date().toISOString(),
        operator,
        failure_class: failureClass,
        attempts_recorded: attempts,
        last_error: lastError,
        failures,
        remediation: `Lockfile reconciliation aborted after ${attempts} attempts. Canonical [${path.basename(canonicalPath)}] held at safe immutable checkpoint.`,
        canonical_preserved: true,
    }
}

/**
 * Dispatches pure 7-bit ASCII telemetry and formatted dossier dump to cns00 console pane.
 */
export const emitDossierTelemetry = async (
    ste: State | null | undefined,
    dossier: CircuitBreakerDossier,
): Promise<void> => {
    if (!ste || typeof ste.hunt !== 'function') return

    const emit = async (src: string) => {
        await ste.hunt(ActCns.UPDATE_CONSOLE, { idx: 'cns00', src }).catch(() => {})
    }

    await emit('>> ================================================================')
    await emit('>> [CIRCUIT BREAKER TRIPPED] HUMAN SAVE GATE CEILING EXHAUSTED')
    await emit(`>> Event           : ${dossier.escalation_event}`)
    await emit(`>> Failure Class   : [${dossier.failure_class}]`)
    await emit(`>> Total Attempts  : ${dossier.attempts_recorded}/3 exhausted`)
    await emit(`>> State Protection: Canonical versions.json preserved (untouched)`)
    await emit(`>> Remediation     : ${dossier.remediation}`)
    await emit('>> ----------------------------------------------------------------')
    await emit('>> FORENSIC DOSSIER DUMP:')
    const dossierLines = JSON.stringify(dossier, null, 2).split('\n')
    for (const line of dossierLines) {
        await emit(`>>   ${line}`)
    }
    await emit('>> ================================================================')
}

/**
 * Orchestrator: Drives the interactive Three-Strike Human Save Gate loop.
 */
export const resolveLockfileHumanGate = async (
    cpy: LibraryModel,
    bal: LibraryBit,
    ste?: State,
): Promise<LibraryModel> => {
    const emit = async (src: string) => {
        if (ste && typeof ste.hunt === 'function') {
            await ste.hunt(ActCns.UPDATE_CONSOLE, { idx: 'cns00', src }).catch(() => {})
        }
    }

    const scratchpadPath = bal?.src || ''
    const dat = (bal?.dat as any) || {}
    const canonicalPath = dat.canonicalPath || path.resolve(process.cwd(), 'data', 'versions.json')
    const operator = dat.operator || 'LOCAL_ARCHITECT'
    const maxAttempts = typeof dat.maxAttempts === 'number' ? dat.maxAttempts : 3
    const editor = dat.editor
    const args = dat.args

    if (!scratchpadPath || !(await fs.pathExists(scratchpadPath))) {
        const errMsg = `Scratchpad file not found: ${scratchpadPath}`
        await emit(`:: [HUMAN_GATE:ERR] ${errMsg}`)
        if (bal?.slv) {
            bal.slv({
                libBit: {
                    idx: 'resolve-lockfile-human-gate-error',
                    src: errMsg,
                    val: -1,
                },
            })
        }
        return cpy
    }

    await emit('>> [HUMAN_GATE] Entering Human Save Gate arbitration loop...')
    let lastFailures: ValidationGateFailure[] = []

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        await emit(`>> [HUMAN_GATE] Cycle ${attempt}/${maxAttempts}: Spawning editor on scratchpad...`)

        // 1. Spawning editor with curses suspension handshake
        if (ste && typeof ste.hunt === 'function') {
            await ste.hunt(ActTrm.EDIT_TERMINAL, {
                src: scratchpadPath,
                dat: { editor, args },
            })
        }

        // 2. Validate saved scratchpad through the Three-Tier Gauntlet
        let report: ValidationGateReport
        if (ste && typeof ste.hunt === 'function') {
            const valBit: any = await ste.hunt(ActLib.VALIDATE_LOCKFILE_SCRATCHPAD, {
                src: scratchpadPath,
            })
            report = valBit?.libBit?.dat as ValidationGateReport
        } else {
            // Standalone test/headless fallback execution
            const { validateLockfileScratchpad } = require('./validation.buzz')
            const mockBal = { src: scratchpadPath, slv: (r: any) => { report = r.libBit.dat } }
            await validateLockfileScratchpad(cpy, mockBal, null)
            report = (report! as ValidationGateReport) || {
                valid: false,
                gate1Passed: false,
                gate2Passed: false,
                gate3Passed: false,
                failures: [{ gate: 'GATE_1_SYNTAX_SCHEMA', message: 'Validation report unavailable' }],
                timestamp: new Date().toISOString(),
            }
        }

        if (report && report.valid) {
            await emit(`>> [HUMAN_GATE] [OK] Resolution verified on Attempt ${attempt}. Ready for promotion.`)
            const result: HumanGateResolutionResult = {
                resolved: true,
                attempts: attempt,
                tripped: false,
                manifest: report.manifest,
                scratchpadPath,
                canonicalPath,
            }
            if (bal?.slv) {
                bal.slv({
                    libBit: {
                        idx: 'resolve-lockfile-human-gate',
                        val: attempt,
                        dat: result,
                        src: scratchpadPath,
                    },
                })
            }
            return cpy
        }

        lastFailures = report?.failures || [{ gate: 'GATE_1_SYNTAX_SCHEMA', message: 'Unknown validation failure' }]
        await emit(`:: [HUMAN_GATE:WARN] Attempt ${attempt} failed with ${lastFailures.length} validation issue(s).`)

        if (attempt < maxAttempts) {
            await emit(`>> [HUMAN_GATE] Prepending actionable error annotations to scratchpad for Attempt ${attempt + 1}...`)
            await annotateScratchpadWithErrors(scratchpadPath, lastFailures, attempt, maxAttempts)
        }
    }

    // 3. Three-Strike Ceiling Breached: Trip the Circuit Breaker
    const dossier = compileCircuitBreakerDossier({
        operator,
        attempts: maxAttempts,
        failures: lastFailures,
        canonicalPath,
    })

    // Obliterate the invalid scratchpad file
    if (await fs.pathExists(scratchpadPath)) {
        await fs.remove(scratchpadPath).catch(() => {})
    }

    // Emit forensic dossier to terminal console
    await emitDossierTelemetry(ste, dossier)

    const result: HumanGateResolutionResult = {
        resolved: false,
        attempts: maxAttempts,
        tripped: true,
        dossier,
        scratchpadPath,
        canonicalPath,
    }

    if (bal?.slv) {
        bal.slv({
            libBit: {
                idx: 'resolve-lockfile-human-gate-tripped',
                val: maxAttempts,
                dat: result,
                src: canonicalPath,
            },
        })
    }

    return cpy
}
