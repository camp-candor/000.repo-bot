import test from 'ava'
import path from 'path'
import fs from 'fs-extra'
import sinon from 'sinon'
import {
    checkSovereigntyInterlock,
    rewireLibrary,
    progressLibrarySaga,
} from '../995.library/00.library.unit/buz/library.buzz'
import { LibraryModel } from '../995.library/00.library.unit/library.model'

test.serial(
    'Phase 5 Sovereignty: blocks periphery broadcast when allow_periphery_broadcast is false',
    async (t) => {
        const sandboxDir = path.resolve(
            process.cwd(),
            'scratch_sovereignty_blocked',
        )
        await fs.ensureDir(sandboxDir)
        const manifestPath = path.join(sandboxDir, 'versions.json')

        await fs.writeJson(manifestPath, {
            sovereign_repo: 'camp-candor/different-master',
            allow_periphery_broadcast: false,
        })

        t.teardown(async () => {
            await fs.remove(sandboxDir).catch(() => {})
        })

        const result = await checkSovereigntyInterlock(manifestPath)

        t.false(result.allowed)
        t.false(result.isSovereign)
        t.is(result.reason, 'PERIPHERY_BROADCAST_FORBIDDEN')
    },
)

test.serial(
    'Phase 5 Sovereignty: allows periphery broadcast when explicitly permitted in manifest',
    async (t) => {
        const sandboxDir = path.resolve(
            process.cwd(),
            'scratch_sovereignty_allowed',
        )
        await fs.ensureDir(sandboxDir)
        const manifestPath = path.join(sandboxDir, 'versions.json')

        await fs.writeJson(manifestPath, {
            sovereign_repo: 'camp-candor/different-master',
            allow_periphery_broadcast: true,
        })

        t.teardown(async () => {
            await fs.remove(sandboxDir).catch(() => {})
        })

        const result = await checkSovereigntyInterlock(manifestPath)

        t.true(result.allowed)
        t.false(result.isSovereign)
        t.true(result.allowPeripheryBroadcast)
        t.is(result.reason, undefined)
    },
)

test.serial(
    'Phase 5 Sovereignty: progressLibrarySaga fails closed when periphery node is blocked',
    async (t) => {
        const sandboxDir = path.resolve(
            process.cwd(),
            'scratch_saga_sovereignty',
        )
        await fs.ensureDir(path.join(sandboxDir, 'apps/995.library/data'))
        const manifestPath = path.join(
            sandboxDir,
            'apps/995.library/data/versions.json',
        )

        await fs.writeJson(manifestPath, {
            sovereign_repo: 'camp-candor/remote-master',
            allow_periphery_broadcast: false,
        })

        const originalCwd = process.cwd
        process.cwd = () => sandboxDir

        t.teardown(async () => {
            process.cwd = originalCwd
            await fs.remove(sandboxDir).catch(() => {})
        })

        const slv = sinon.fake()
        const bal = { src: 'packages/000.agent', slv } as any

        await progressLibrarySaga(new LibraryModel(), bal, null as any)

        t.true(slv.calledOnce)
        const payload = slv.firstCall.args[0]
        t.is(payload.libBit.idx, 'progress-library-saga-error')
        t.is(payload.libBit.src, 'SOVEREIGNTY_BLOCKED')
    },
)

test.serial(
    'Phase 5 Hot Re-Wiring: purges require.cache and invalidates target modules cleanly',
    async (t) => {
        const sandboxDir = path.resolve(process.cwd(), 'scratch_rewire_test')
        const mockModulePath = path.join(sandboxDir, 'dummy.unit.js')
        await fs.ensureDir(sandboxDir)
        await fs.writeFile(mockModulePath, 'module.exports = { value: 1 };')

        // Populate require.cache
        require(mockModulePath)
        t.truthy(require.cache[mockModulePath])

        t.teardown(async () => {
            delete require.cache[mockModulePath]
            await fs.remove(sandboxDir).catch(() => {})
        })

        const slv = sinon.fake()
        const bal = { src: sandboxDir, slv } as any

        await rewireLibrary(new LibraryModel(), bal, null as any)

        t.true(slv.calledOnce)
        t.falsy(
            require.cache[mockModulePath],
            'Module path must be purged from require.cache',
        )
        const res = slv.firstCall.args[0]
        t.is(res.libBit.idx, 'rewire-library')
        t.true(res.libBit.dat.rewired)
    },
)
