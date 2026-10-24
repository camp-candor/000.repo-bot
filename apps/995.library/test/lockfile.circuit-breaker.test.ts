import test from 'ava'
import path from 'path'
import fs from 'fs-extra'
import sinon from 'sinon'
import { LibraryModel } from '../995.library/00.library.unit/library.model'
import * as ActLib from '../995.library/00.library.unit/library.action'
import * as ActTrm from '../995.library/80.terminal.unit/terminal.action'
import { reducer } from '../995.library/00.library.unit/library.reduce'
import {
    annotateScratchpadWithErrors,
    compileCircuitBreakerDossier,
    emitDossierTelemetry,
    resolveLockfileHumanGate,
} from '../995.library/00.library.unit/buz/circuit-breaker.buzz'

const sampleValidJson = `{
  "schema_version": 1,
  "library_version": "1.0.12",
  "updated_at": "2026-09-26T12:00:00Z",
  "sovereign_repo": "camp-candor/995.library",
  "allow_periphery_broadcast": false,
  "shared_pivots": {},
  "repositories": {
    "repo-a": {
      "path": "packages/repo-a",
      "pinned_sha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "required_contract_version": "1.0.12",
      "expected_branch": "main",
      "status": "LOCKED"
    }
  }
}`

test('annotateScratchpadWithErrors -- prepends error header and removes stale annotations on retry', async (t) => {
    const sandboxDir = path.resolve(process.cwd(), 'scratch_test_annotate_errors')
    const scratchpadFile = path.join(sandboxDir, 'conflict.json')
    await fs.ensureDir(sandboxDir)
    await fs.writeFile(scratchpadFile, sampleValidJson, 'utf8')

    t.teardown(async () => {
        await fs.remove(sandboxDir).catch(() => {})
    })

    const failures = [
        { gate: 'GATE_1_SYNTAX_SCHEMA' as const, field: 'required_contract_version', message: 'Invalid SemVer' },
    ]

    // Attempt 1 annotation
    const annotated1 = await annotateScratchpadWithErrors(scratchpadFile, failures, 1, 3)
    t.true(annotated1.includes('>> [VALIDATION FAILURE - ATTEMPT 1 OF 3]'))
    t.true(annotated1.includes('Invalid SemVer'))

    // Attempt 2 annotation replaces attempt 1
    const failures2 = [
        { gate: 'GATE_2_CAS_COMMIT' as const, field: 'pinned_sha', message: 'SHA must be 40 chars' },
    ]
    const annotated2 = await annotateScratchpadWithErrors(scratchpadFile, failures2, 2, 3)
    t.false(annotated2.includes('ATTEMPT 1 OF 3'))
    t.true(annotated2.includes('>> [VALIDATION FAILURE - ATTEMPT 2 OF 3]'))
    t.true(annotated2.includes('SHA must be 40 chars'))
})

test('compileCircuitBreakerDossier -- builds strongly typed escalation dossier with correct classification', (t) => {
    const dossier = compileCircuitBreakerDossier({
        operator: 'TEST_OPERATOR',
        attempts: 3,
        failures: [
            { gate: 'GATE_2_CAS_COMMIT', field: 'pinned_sha', message: 'SHA unreachable in git' },
        ],
        canonicalPath: '/path/to/versions.json',
    })

    t.is(dossier.escalation_event, 'LOCKFILE_HUMAN_GATE_BREAKER_TRIPPED')
    t.is(dossier.operator, 'TEST_OPERATOR')
    t.is(dossier.attempts_recorded, 3)
    t.is(dossier.failure_class, 'CAS_REACHABILITY_FAILURE')
    t.true(dossier.canonical_preserved)
    t.regex(dossier.remediation, /Canonical \[versions\.json\] held at safe immutable checkpoint/)
})

test('emitDossierTelemetry -- streams pure 7-bit ASCII lines to cns00 console pane', async (t) => {
    const loggedMessages: string[] = []
    const mockState = {
        hunt: sinon.spy(async (_act: string, payload: any) => {
            if (payload?.src) loggedMessages.push(payload.src)
            return {}
        }),
    } as any

    const dossier = compileCircuitBreakerDossier({
        operator: 'TEST_ARCHITECT',
        attempts: 3,
        failures: [{ gate: 'GATE_1_SYNTAX_SCHEMA', message: 'Syntax error' }],
        canonicalPath: 'data/versions.json',
    })

    await emitDossierTelemetry(mockState, dossier)

    t.true(loggedMessages.length > 5)
    t.true(loggedMessages.some((m) => m.includes('[CIRCUIT BREAKER TRIPPED]')))
    t.true(loggedMessages.some((m) => m.includes('PERSISTENT_SCHEMA_VIOLATION')))

    for (const msg of loggedMessages) {
        t.regex(msg, /^[\x00-\x7F]*$/, `Telemetry message must be pure 7-bit ASCII: ${msg}`)
    }
})

test.serial('resolveLockfileHumanGate -- succeeds on Attempt 1 when validation passes immediately', async (t) => {
    const sandboxDir = path.resolve(process.cwd(), 'scratch_test_human_gate_success')
    const scratchpadFile = path.join(sandboxDir, 'valid.json')
    await fs.ensureDir(sandboxDir)
    await fs.writeFile(scratchpadFile, sampleValidJson, 'utf8')

    t.teardown(async () => {
        await fs.remove(sandboxDir).catch(() => {})
    })

    const model = new LibraryModel()
    const slv = sinon.fake()
    const mockState = {
        hunt: sinon.spy(async (act: string, _payload: any) => {
            if (act === ActTrm.EDIT_TERMINAL) return { trmBit: { idx: 'edit-terminal', val: 0 } }
            if (act === ActLib.VALIDATE_LOCKFILE_SCRATCHPAD) {
                return {
                    libBit: {
                        idx: 'validate-lockfile-scratchpad',
                        dat: { valid: true, manifest: JSON.parse(sampleValidJson) },
                    },
                }
            }
            return {}
        }),
    } as any

    await resolveLockfileHumanGate(model, { src: scratchpadFile, slv } as any, mockState)

    t.true(slv.calledOnce)
    const res = slv.firstCall.args[0]
    t.is(res.libBit.idx, 'resolve-lockfile-human-gate')
    t.is(res.libBit.val, 1)
    t.true(res.libBit.dat.resolved)
    t.false(res.libBit.dat.tripped)
})

test.serial('resolveLockfileHumanGate -- trips circuit breaker on Attempt 3, purges scratchpad, and preserves canonical', async (t) => {
    const sandboxDir = path.resolve(process.cwd(), 'scratch_test_human_gate_tripped')
    const scratchpadFile = path.join(sandboxDir, 'corrupt.json')
    const canonicalFile = path.join(sandboxDir, 'versions.json')
    await fs.ensureDir(sandboxDir)
    await fs.writeFile(scratchpadFile, '{ broken json', 'utf8')
    await fs.writeFile(canonicalFile, sampleValidJson, 'utf8')

    t.teardown(async () => {
        await fs.remove(sandboxDir).catch(() => {})
    })

    const model = new LibraryModel()
    const slv = sinon.fake()

    const mockState = {
        hunt: sinon.spy(async (act: string, _payload: any) => {
            if (act === ActTrm.EDIT_TERMINAL) return { trmBit: { idx: 'edit-terminal', val: 0 } }
            if (act === ActLib.VALIDATE_LOCKFILE_SCRATCHPAD) {
                return {
                    libBit: {
                        idx: 'validate-lockfile-scratchpad-fail',
                        dat: {
                            valid: false,
                            failures: [{ gate: 'GATE_1_SYNTAX_SCHEMA', message: 'Syntax error' }],
                        },
                    },
                }
            }
            return {}
        }),
    } as any

    await resolveLockfileHumanGate(
        model,
        {
            src: scratchpadFile,
            dat: { canonicalPath: canonicalFile, maxAttempts: 3 },
            slv,
        } as any,
        mockState,
    )

    t.true(slv.calledOnce)
    const res = slv.firstCall.args[0]
    t.is(res.libBit.idx, 'resolve-lockfile-human-gate-tripped')
    t.is(res.libBit.val, 3)
    t.true(res.libBit.dat.tripped)
    t.false(res.libBit.dat.resolved)

    // Assert scratchpad was obliterated
    t.false(await fs.pathExists(scratchpadFile))

    // Assert canonical versions.json was preserved
    t.true(await fs.pathExists(canonicalFile))
    const preservedContent = await fs.readFile(canonicalFile, 'utf8')
    t.is(preservedContent, sampleValidJson)
})

test('Reducer routing -- wraps model in clone(model, true) for RESOLVE_LOCKFILE_HUMAN_GATE', (t) => {
    const model = new LibraryModel()
    const act = new ActLib.ResolveLockfileHumanGate({ src: 'test.json' })
    const reduced = reducer(model, act)
    t.truthy(reduced)
})
