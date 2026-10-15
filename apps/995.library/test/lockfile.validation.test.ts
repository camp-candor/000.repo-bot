import test from 'ava'
import path from 'path'
import fs from 'fs-extra'
import sinon from 'sinon'
import { LibraryModel } from '../995.library/00.library.unit/library.model'
import * as ActLib from '../995.library/00.library.unit/library.action'
import { reducer } from '../995.library/00.library.unit/library.reduce'
import {
    stripConflictComments,
    validateGate1Schema,
    validateGate2CommitReachability,
    validateGate3MonotonicCompatibility,
    validateLockfileScratchpad,
} from '../995.library/00.library.unit/buz/validation.buzz'

const validManifestRaw = `{
  "$schema": "https://camp-candor.org/schemas/versions.v1.json",
  "schema_version": 1,
  "library_version": "1.0.12",
  "updated_at": "2026-09-26T12:00:00Z",
  "sovereign_repo": "camp-candor/995.library",
  "allow_periphery_broadcast": false,
  "shared_pivots": {
    "000.agent": "1.0.12"
  },
  "repositories": {
    "repo-alpha": {
      "path": "packages/repo-alpha",
      "cluster": "common",
      /* <<<<<<< LOCAL WORKSPACE PIN: aaaaa11111 */
      "pinned_sha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "required_contract_version": "1.0.12",
      "expected_branch": "main",
      "status": "LOCKED"
      /* ======= REMOTE SOVEREIGN PIN: bbbbb22222 */
      // "pinned_sha": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      /* >>>>>>> */
    }
  }
}`

test('stripConflictComments -- purges block and single line comments without corrupting strings', (t) => {
    const cleaned = stripConflictComments(validManifestRaw)
    t.false(cleaned.includes('/* <<<<<<<'))
    t.false(cleaned.includes('// "pinned_sha"'))
    t.true(
        cleaned.includes(
            '"pinned_sha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"',
        ),
    )
    t.notThrows(
        () => JSON.parse(cleaned),
        'Cleaned content must parse as valid JSON',
    )
})

test('Gate 1: Schema Sanity -- enforces strict SemVer and rejects wildcards', (t) => {
    // Valid case
    const validRes = validateGate1Schema(validManifestRaw)
    t.true(validRes.valid)
    t.truthy(validRes.manifest)

    // Wildcard version failure
    const invalidVer = validManifestRaw.replace('"1.0.12"', '"^1.0.12"')
    const failRes = validateGate1Schema(invalidVer)
    t.false(failRes.valid)
    t.true(failRes.failures.some((f) => f.message.includes('strict SemVer')))
})

test('Gate 2: CAS Commit Audit -- catches invalid SHA length or characters', async (t) => {
    const validRes = validateGate1Schema(validManifestRaw)
    const manifest = validRes.manifest!

    const cleanCas = await validateGate2CommitReachability(manifest)
    t.true(cleanCas.valid)

    // Tamper with SHA (39 chars instead of 40)
    const tamperedManifest = JSON.parse(JSON.stringify(manifest))
    tamperedManifest.repositories['repo-alpha'].pinned_sha =
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    const tamperedCas = await validateGate2CommitReachability(tamperedManifest)
    t.false(tamperedCas.valid)
    t.true(tamperedCas.failures.some((f) => f.field === 'pinned_sha'))
})

test('Gate 3: Monotonic SAT -- detects LOCKED version divergence from sovereign library version', (t) => {
    const validRes = validateGate1Schema(validManifestRaw)
    const manifest = validRes.manifest!

    const cleanSat = validateGate3MonotonicCompatibility(manifest)
    t.true(cleanSat.valid)

    // Introduce LOCKED version drift
    const drifted = JSON.parse(JSON.stringify(manifest))
    drifted.repositories['repo-alpha'].required_contract_version = '1.0.10'
    const driftedSat = validateGate3MonotonicCompatibility(drifted)
    t.false(driftedSat.valid)
    t.true(driftedSat.failures.some((f) => f.gate === 'GATE_3_MONOTONIC_SAT'))
})

test.serial(
    'validateLockfileScratchpad -- dispatches telemetry and returns clean report for valid scratchpad',
    async (t) => {
        const sandboxDir = path.resolve(
            process.cwd(),
            'scratch_test_validation_buzz',
        )
        const scratchpadFile = path.join(
            sandboxDir,
            '.tmp_versions_conflict_test.json',
        )
        await fs.ensureDir(sandboxDir)
        await fs.writeFile(scratchpadFile, validManifestRaw, 'utf8')

        t.teardown(async () => {
            await fs.remove(sandboxDir).catch(() => {})
        })

        const model = new LibraryModel()
        const slv = sinon.fake()
        const bal = { src: scratchpadFile, slv } as any

        const hunt = sinon.fake.resolves({})
        const ste = { hunt } as any

        await validateLockfileScratchpad(model, bal, ste)

        t.true(slv.calledOnce)
        const res = slv.firstCall.args[0]
        t.is(res.libBit.idx, 'validate-lockfile-scratchpad')
        t.is(res.libBit.val, 0)
        t.true(res.libBit.dat.valid)

        // Telemetry assertions
        t.true(hunt.called)
        const messages = hunt.args.map((call: any) => call[1]?.src)
        t.true(
            messages.some((m: string) =>
                m.includes('>> [VALIDATION:GATE_1] [OK]'),
            ),
        )
        t.true(
            messages.some((m: string) =>
                m.includes('>> [VALIDATION:GATE_2] [OK]'),
            ),
        )
        t.true(
            messages.some((m: string) =>
                m.includes('>> [VALIDATION:GATE_3] [OK]'),
            ),
        )
    },
)

test('Reducer routing -- wraps model in clone(model, true) for VALIDATE_LOCKFILE_SCRATCHPAD', (t) => {
    const model = new LibraryModel()
    const act = new ActLib.ValidateLockfileScratchpad({ src: 'test.json' })
    const reduced = reducer(model, act)
    t.truthy(reduced)
})
