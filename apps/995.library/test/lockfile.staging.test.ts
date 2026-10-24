import test from 'ava'
import path from 'path'
import fs from 'fs-extra'
import sinon from 'sinon'
import { LibraryModel } from '../995.library/00.library.unit/library.model'
import * as ActLib from '../995.library/00.library.unit/library.action'
import { reducer } from '../995.library/00.library.unit/library.reduce'
import type { VersionsManifest } from '../995.library/00.library.unit/fce/versions.interface'
import {
    analyzeManifestDivergence,
    synthesizeConflictScratchpad,
    stageLockfileConflict,
    purgeLockfileScratchpad,
} from '../995.library/00.library.unit/buz/lockfile.buzz'

const mockManifestLocal: VersionsManifest = {
    schema_version: 1,
    library_version: '1.0.12',
    updated_at: '2026-09-26T12:00:00Z',
    sovereign_repo: 'camp-candor/995.library',
    allow_periphery_broadcast: false,
    shared_pivots: { '000.agent': '1.0.12' },
    repositories: {
        'repo-alpha': {
            path: 'packages/repo-alpha',
            pinned_sha: '1111111111111111111111111111111111111111',
            required_contract_version: '1.0.12',
            expected_branch: 'main',
            status: 'LOCKED',
        },
        'repo-beta': {
            path: 'packages/repo-beta',
            pinned_sha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            required_contract_version: '1.0.12',
            expected_branch: 'main',
            status: 'LOCKED',
        },
    },
}

const mockManifestRemote: VersionsManifest = {
    schema_version: 1,
    library_version: '1.0.13',
    updated_at: '2026-09-26T14:00:00Z',
    sovereign_repo: 'camp-candor/995.library',
    allow_periphery_broadcast: false,
    shared_pivots: { '000.agent': '1.0.13' },
    repositories: {
        'repo-alpha': {
            path: 'packages/repo-alpha',
            pinned_sha: '2222222222222222222222222222222222222222',
            required_contract_version: '1.0.13',
            expected_branch: 'main',
            status: 'LOCKED',
        },
        'repo-beta': {
            path: 'packages/repo-beta',
            pinned_sha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            required_contract_version: '1.0.12',
            expected_branch: 'main',
            status: 'LOCKED',
        },
    },
}

test('analyzeManifestDivergence -- detects divergent pinned_sha and version', (t) => {
    const analysis = analyzeManifestDivergence(mockManifestLocal, mockManifestRemote)
    t.true(analysis.hasDivergence)
    t.is(analysis.conflictCount, 1)

    const alphaDiff = analysis.conflicts['repo-alpha']
    t.true(alphaDiff.hasConflict)
    t.true(alphaDiff.diffFields.includes('pinned_sha'))
    t.true(alphaDiff.diffFields.includes('required_contract_version'))

    const betaDiff = analysis.conflicts['repo-beta']
    t.false(betaDiff.hasConflict)
    t.is(betaDiff.diffFields.length, 0)
})

test('synthesizeConflictScratchpad -- emits structured three-way diff annotations', (t) => {
    const analysis = analyzeManifestDivergence(mockManifestLocal, mockManifestRemote)
    const output = synthesizeConflictScratchpad(analysis)

    t.true(output.includes('/* <<<<<<< LOCAL WORKSPACE PIN: 1111111111 */'))
    t.true(output.includes('/* ======= REMOTE SOVEREIGN PIN: 2222222222 */'))
    t.true(output.includes('/* >>>>>>> */'))
    t.true(output.includes('"repo-beta"'))
})

test.serial('stageLockfileConflict -- stages scratchpad into isolated directory without mutating canonical', async (t) => {
    const sandboxDir = path.resolve(process.cwd(), 'scratch_test_lockfile_stage')
    const canonicalFile = path.join(sandboxDir, 'versions.json')

    await fs.ensureDir(sandboxDir)
    await fs.writeJson(canonicalFile, mockManifestLocal)

    t.teardown(async () => {
        await fs.remove(sandboxDir).catch(() => {})
        await fs.remove(path.resolve(process.cwd(), 'data', 'lockfile')).catch(() => {})
    })

    const model = new LibraryModel()
    const slv = sinon.fake()
    const bal = {
        src: canonicalFile,
        dat: {
            localManifest: mockManifestLocal,
            remoteManifest: mockManifestRemote,
        },
        slv,
    } as any

    await stageLockfileConflict(model, bal, null as any)

    t.true(slv.calledOnce)
    const res = slv.firstCall.args[0]
    t.is(res.libBit.idx, 'stage-lockfile-conflict')
    t.is(res.libBit.val, 1)

    const scratchpadPath = res.libBit.src
    t.true(await fs.pathExists(scratchpadPath))

    // Ensure canonical file was not overwritten
    const canonicalOnDisk = await fs.readJson(canonicalFile)
    t.is(canonicalOnDisk.library_version, '1.0.12')
    t.is(canonicalOnDisk.repositories['repo-alpha'].pinned_sha, '1111111111111111111111111111111111111111')

    // Clean up scratchpad
    const purgeBal = { src: scratchpadPath, slv: sinon.fake() } as any
    await purgeLockfileScratchpad(model, purgeBal, null as any)
    t.false(await fs.pathExists(scratchpadPath))
})

test.serial('stageLockfileConflict -- returns clean indicator when manifests match', async (t) => {
    const model = new LibraryModel()
    const slv = sinon.fake()
    const bal = {
        src: 'data/versions.json',
        dat: {
            localManifest: mockManifestLocal,
            remoteManifest: mockManifestLocal,
        },
        slv,
    } as any

    await stageLockfileConflict(model, bal, null as any)

    t.true(slv.calledOnce)
    const res = slv.firstCall.args[0]
    t.is(res.libBit.idx, 'stage-lockfile-clean')
    t.is(res.libBit.val, 0)
})

test('Reducer routing -- wraps model in clone(model, true) for lockfile actions', (t) => {
    const model = new LibraryModel()
    const stagedAct = new ActLib.StageLockfileConflict({ idx: 'test-stage' })
    const purgedAct = new ActLib.PurgeLockfileScratchpad({ idx: 'test-purge' })

    const reducedStage = reducer(model, stagedAct)
    t.truthy(reducedStage)

    const reducedPurge = reducer(model, purgedAct)
    t.truthy(reducedPurge)
})
