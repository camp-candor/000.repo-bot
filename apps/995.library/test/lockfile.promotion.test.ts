import test from 'ava'
import path from 'path'
import fs from 'fs-extra'
import sinon from 'sinon'
import { LibraryModel } from '../995.library/00.library.unit/library.model'
import * as ActLib from '../995.library/00.library.unit/library.action'
import { reducer } from '../995.library/00.library.unit/library.reduce'
import {
    computeCanonicalManifestHash,
    readLastLedgerEntry,
    mintLockfileLedgerEntry,
    promoteLockfileScratchpad,
} from '../995.library/00.library.unit/buz/promotion.buzz'

const sampleManifestInitial = {
    schema_version: 1,
    library_version: '1.0.12',
    updated_at: '2026-09-26T12:00:00Z',
    sovereign_repo: 'camp-candor/995.library',
    allow_periphery_broadcast: false,
    shared_pivots: {},
    repositories: {
        'repo-a': {
            path: 'packages/repo-a',
            pinned_sha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            required_contract_version: '1.0.12',
            expected_branch: 'main',
            status: 'LOCKED',
        },
    },
}

const sampleManifestResolved = {
    schema_version: 1,
    library_version: '1.0.13',
    updated_at: '2026-09-26T16:00:00Z',
    sovereign_repo: 'camp-candor/995.library',
    allow_periphery_broadcast: false,
    shared_pivots: {},
    repositories: {
        'repo-a': {
            path: 'packages/repo-a',
            pinned_sha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
            required_contract_version: '1.0.13',
            expected_branch: 'main',
            status: 'LOCKED',
        },
    },
}

test('computeCanonicalManifestHash -- produces bit-identical SHA-256 irrespective of key ordering', (t) => {
    const objA = { z: 1, a: 2, m: { y: 'bar', x: 'foo' } }
    const objB = { a: 2, z: 1, m: { x: 'foo', y: 'bar' } }

    const hashA = computeCanonicalManifestHash(objA)
    const hashB = computeCanonicalManifestHash(objB)

    t.is(
        hashA,
        hashB,
        'Deterministic canonical sorting must yield identical hash digests',
    )
    t.is(hashA.length, 64, 'Digest must be 64-character hexadecimal')
})

test('mintLockfileLedgerEntry -- links sequential blocks cryptographically in NDJSON file', async (t) => {
    const sandboxDir = path.resolve(process.cwd(), 'scratch_test_ledger_mint')
    const ledgerFile = path.join(sandboxDir, 'lockfile.ledger.ndjson')
    await fs.ensureDir(sandboxDir)

    t.teardown(async () => {
        await fs.remove(sandboxDir).catch(() => {})
    })

    // Mint Block #1
    const block1 = await mintLockfileLedgerEntry({
        ledgerPath: ledgerFile,
        eventType: 'LOCKFILE_RESOLVED',
        operator: 'ARCHITECT_A',
        canonicalPath: '/path/versions.json',
        preHash:
            '0000000000000000000000000000000000000000000000000000000000000000',
        postHash:
            '1111111111111111111111111111111111111111111111111111111111111111',
        manifest: sampleManifestInitial as any,
    })

    t.is(block1.index, 1)
    t.is(
        block1.previous_block_hash,
        '0000000000000000000000000000000000000000000000000000000000000000',
    )

    // Mint Block #2
    const block2 = await mintLockfileLedgerEntry({
        ledgerPath: ledgerFile,
        eventType: 'DIRECTOR_OVERRIDE',
        operator: 'ARCHITECT_B',
        canonicalPath: '/path/versions.json',
        preHash:
            '1111111111111111111111111111111111111111111111111111111111111111',
        postHash:
            '2222222222222222222222222222222222222222222222222222222222222222',
        manifest: sampleManifestResolved as any,
    })

    t.is(block2.index, 2)
    t.is(
        block2.previous_block_hash,
        block1.block_hash,
        'Block 2 must cryptographically link to Block 1 hash',
    )

    // Verify reading last entry
    const lastEntry = await readLastLedgerEntry(ledgerFile)
    t.is(lastEntry?.block_hash, block2.block_hash)
})

test.serial(
    'promoteLockfileScratchpad -- atomically promotes scratchpad, mints ledger, and cleans up',
    async (t) => {
        const sandboxDir = path.resolve(
            process.cwd(),
            'scratch_test_lockfile_promotion_success',
        )
        const scratchpadFile = path.join(sandboxDir, 'scratchpad.json')
        const canonicalFile = path.join(sandboxDir, 'versions.json')
        const ledgerFile = path.join(sandboxDir, 'audit.ndjson')

        await fs.ensureDir(sandboxDir)
        await fs.writeJson(canonicalFile, sampleManifestInitial)
        await fs.writeFile(
            scratchpadFile,
            `/* <<<<<<< MERGE COMMENTS */\n${JSON.stringify(sampleManifestResolved)}\n/* >>>>>>> */`,
            'utf8',
        )

        t.teardown(async () => {
            await fs.remove(sandboxDir).catch(() => {})
        })

        const model = new LibraryModel()
        const slv = sinon.fake()
        const bal = {
            src: scratchpadFile,
            dat: {
                canonicalPath: canonicalFile,
                ledgerPath: ledgerFile,
                operator: 'TEST_AGENT',
            },
            slv,
        } as any

        const hunt = sinon.fake.resolves({})
        const ste = { hunt } as any

        await promoteLockfileScratchpad(model, bal, ste)

        t.true(slv.calledOnce)
        const res = slv.firstCall.args[0]
        t.is(res.libBit.idx, 'promote-lockfile-scratchpad')
        t.is(res.libBit.val, 1)

        // Assert canonical file contains resolved content and no merge comments
        t.true(await fs.pathExists(canonicalFile))
        const promotedOnDisk = await fs.readJson(canonicalFile)
        t.is(promotedOnDisk.library_version, '1.0.13')
        t.is(
            promotedOnDisk.repositories['repo-a'].pinned_sha,
            'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        )

        // Assert scratchpad was unlinked via promotion rename
        t.false(await fs.pathExists(scratchpadFile))

        // Assert ledger block was minted
        t.true(await fs.pathExists(ledgerFile))
        const lastEntry = await readLastLedgerEntry(ledgerFile)
        t.is(lastEntry?.operator, 'TEST_AGENT')
        t.is(lastEntry?.event_type, 'LOCKFILE_RESOLVED')
    },
)

test.serial(
    'promoteLockfileScratchpad [NEG_CONTROL] -- restores backup if promotion encounters error',
    async (t) => {
        const sandboxDir = path.resolve(
            process.cwd(),
            'scratch_test_promotion_rollback',
        )
        const canonicalFile = path.join(sandboxDir, 'versions.json')

        await fs.ensureDir(sandboxDir)
        await fs.writeJson(canonicalFile, sampleManifestInitial)

        t.teardown(async () => {
            await fs.remove(sandboxDir).catch(() => {})
        })

        const model = new LibraryModel()
        const slv = sinon.fake()
        const bal = {
            src: '/nonexistent/phantom/scratchpad.json',
            dat: { canonicalPath: canonicalFile },
            slv,
        } as any

        await promoteLockfileScratchpad(model, bal, null as any)

        t.true(slv.calledOnce)
        const res = slv.firstCall.args[0]
        t.is(res.libBit.idx, 'promote-lockfile-scratchpad-error')
        t.is(res.libBit.val, -1)

        // Assert canonical file was preserved
        const canonicalOnDisk = await fs.readJson(canonicalFile)
        t.is(canonicalOnDisk.library_version, '1.0.12')
    },
)

test('Reducer routing -- wraps model in clone(model, true) for promotion and ledger actions', (t) => {
    const model = new LibraryModel()
    const actPromote = new ActLib.PromoteLockfileScratchpad({
        src: 'test.json',
    })
    const actMint = new ActLib.MintLockfileLedger({ src: 'ledger.ndjson' })

    const reducedPromote = reducer(model, actPromote)
    t.truthy(reducedPromote)

    const reducedMint = reducer(model, actMint)
    t.truthy(reducedMint)
})
