import test from 'ava'
import sinon from 'sinon'
import path from 'path'
import fs from 'fs-extra'
import { LibraryModel } from '../995.library/00.library.unit/library.model'
import { reducer } from '../995.library/00.library.unit/library.reduce'
import {
    ScanFleet,
    AuditLibrary,
    AUDIT_LIBRARY,
} from '../995.library/00.library.unit/library.action'
import * as ActLib from '../995.library/00.library.unit/library.action'
import {
    flatLibrary,
    updateLibrary,
} from '../995.library/00.library.unit/buz/library.buzz'

function makeBal() {
    return { slv: sinon.fake() } as any
}

function makeModel() {
    return new LibraryModel()
}

const ste = null as any

test.serial(
    'flatLibrary -- writes flattened code to root data/flat, not apps/data',
    async (t) => {
        const bal = makeBal()
        await flatLibrary(makeModel(), bal, ste)

        t.true(bal.slv.calledOnce, 'bal.slv should be called once')
        const result = bal.slv.firstCall.args[0]
        t.is(result.libBit.idx, 'flat-library')

        const relativeOutputPath = result.libBit.src
        t.true(
            relativeOutputPath.startsWith('data/flat/'),
            `Path must start with data/flat/, got: ${relativeOutputPath}`,
        )
        t.false(
            relativeOutputPath.includes('apps/data'),
            'Path must not include apps/data',
        )

        let repoRoot = process.cwd()
        while (
            repoRoot &&
            !(
                fs.existsSync(path.join(repoRoot, 'apps')) &&
                fs.existsSync(path.join(repoRoot, 'packages'))
            )
        ) {
            const parent = path.dirname(repoRoot)
            if (parent === repoRoot) break
            repoRoot = parent
        }

        const absoluteOutputFile = path.join(repoRoot, relativeOutputPath)

        // Guaranteed teardown hook via AVA lifecycle
        t.teardown(async () => {
            await fs.remove(absoluteOutputFile).catch(() => {})
        })

        t.true(
            fs.existsSync(absoluteOutputFile),
            `File should exist on disk at ${absoluteOutputFile}`,
        )

        const content = await fs.readFile(absoluteOutputFile, 'utf8')
        t.true(content.length > 0, 'Flattened content should not be empty')
        t.true(
            result.libBit.val > 0,
            'Should have flattened at least one code file',
        )
        const wranglerSources = content
            .split('\n')
            .filter(
                (line) =>
                    line.startsWith('// ----- SOURCE:') &&
                    line.includes('.wrangler'),
            )
        t.deepEqual(
            wranglerSources,
            [],
            'Flattened content must not contain .wrangler source files',
        )
    },
)

test.serial(
    'updateLibrary -- targets scoped package workspace and synthesizes valid BEE.ts',
    async (t) => {
        let repoRoot = process.cwd()
        while (
            repoRoot &&
            !(
                fs.existsSync(path.join(repoRoot, 'apps')) &&
                fs.existsSync(path.join(repoRoot, 'packages'))
            )
        ) {
            const parent = path.dirname(repoRoot)
            if (parent === repoRoot) break
            repoRoot = parent
        }

        const scratchPackage = path.join(
            repoRoot,
            'packages',
            'scratch_test_pkg',
        )
        const unitDir = path.join(scratchPackage, '00.sample.unit')
        const fceDir = path.join(unitDir, 'fce')

        await fs.ensureDir(fceDir)
        await fs.writeFile(
            path.join(unitDir, 'sample.unit.ts'),
            'export default class SampleUnit {}',
        )
        await fs.writeFile(
            path.join(unitDir, 'sample.model.ts'),
            'export class SampleModel {}',
        )
        await fs.writeFile(
            path.join(unitDir, 'sample.reduce.ts'),
            'export function reducer() {}',
        )
        await fs.writeFile(
            path.join(fceDir, 'sample.interface.ts'),
            'export default interface Sample {}',
        )

        t.teardown(async () => {
            await fs.remove(scratchPackage).catch(() => {})
        })

        const bal = {
            src: 'packages/scratch_test_pkg',
            slv: sinon.fake(),
        } as any

        await updateLibrary(makeModel(), bal, ste)

        t.true(bal.slv.calledOnce, 'Resolver must be called once')
        const res = bal.slv.firstCall.args[0]
        t.is(res.libBit.idx, 'update-library')
        t.is(res.libBit.val, 1, 'Should register exactly 1 discovered unit')

        const generatedBee = path.join(scratchPackage, 'BEE.ts')
        t.true(
            fs.existsSync(generatedBee),
            'BEE.ts must exist in target package',
        )

        const content = await fs.readFile(generatedBee, 'utf8')
        t.true(
            content.includes(
                'import SampleUnit from "./00.sample.unit/sample.unit";',
            ),
        )
        t.true(
            content.includes(
                'import { SampleModel } from "./00.sample.unit/sample.model";',
            ),
        )
        t.true(content.includes('sample: reduceFromSample.reducer'))
        t.false(
            content.includes('apps/995.library'),
            'Must not reference parent app path',
        )
    },
)

test.serial(
    'updateLibrary -- empty directory with zero units detected emits warning and writes empty shell',
    async (t) => {
        let repoRoot = process.cwd()
        while (
            repoRoot &&
            !(
                fs.existsSync(path.join(repoRoot, 'apps')) &&
                fs.existsSync(path.join(repoRoot, 'packages'))
            )
        ) {
            const parent = path.dirname(repoRoot)
            if (parent === repoRoot) break
            repoRoot = parent
        }

        const scratchEmptyPkg = path.join(
            repoRoot,
            'packages',
            'scratch_empty_test_pkg',
        )
        await fs.ensureDir(scratchEmptyPkg)

        t.teardown(async () => {
            await fs.remove(scratchEmptyPkg).catch(() => {})
        })

        const consoleHuntFake = sinon.fake()
        const mockSte = {
            hunt: consoleHuntFake,
        } as any

        const bal = {
            src: 'packages/scratch_empty_test_pkg',
            slv: sinon.fake(),
        } as any

        await updateLibrary(makeModel(), bal, mockSte)

        t.true(bal.slv.calledOnce)
        const res = bal.slv.firstCall.args[0]
        t.is(res.libBit.idx, 'update-library')
        t.is(res.libBit.val, 0, 'Should register 0 discovered units')

        const generatedBee = path.join(scratchEmptyPkg, 'BEE.ts')
        t.true(
            fs.existsSync(generatedBee),
            'BEE.ts must exist in target package',
        )

        t.true(
            consoleHuntFake.calledWith(
                sinon.match.any,
                sinon.match.has(
                    'src',
                    sinon.match(/No \.unit packages detected/),
                ),
            ),
        )
    },
)

test.serial(
    'updateLibrary -- fail-closed when target workspace directory is missing',
    async (t) => {
        const bal = {
            src: 'packages/non_existent_domain_xyz',
            slv: sinon.fake(),
        } as any

        await updateLibrary(makeModel(), bal, ste)

        t.true(bal.slv.calledOnce)
        const res = bal.slv.firstCall.args[0]
        t.is(res.libBit.idx, 'update-library-err')
        t.true(res.libBit.dat.includes('Target directory not found'))
    },
)

test.serial(
    'scanFleet -- dispatches through reducer and executes buzzer cleanly',
    async (t) => {
        const bal = makeBal()
        const model = makeModel()
        process.env.FLEET_ROOT = process.cwd()
        const action = new ScanFleet(bal)

        const resultModel = await reducer(model, action, ste)
        t.truthy(resultModel, 'Reducer must return state model')
        t.true(
            bal.slv.calledOnce,
            'bal.slv should be called once by scanFleet stub',
        )

        const result = bal.slv.firstCall.args[0]
        t.is(result.libBit.idx, 'scan-fleet')
        t.true(Array.isArray(result.libBit.lst))
    },
)

test.serial(
    'auditLibrary -- dispatches through reducer and executes baseline buzzer cleanly',
    async (t) => {
        const bal = makeBal()
        const model = makeModel()
        const action = new ActLib.AuditLibrary(bal)

        const resultModel = await reducer(model, action, ste)
        t.truthy(resultModel, 'Reducer must return state model')
        t.true(
            bal.slv.calledOnce,
            'bal.slv should be called once by auditLibrary',
        )

        const result = bal.slv.firstCall.args[0]
        t.is(result.libBit.idx, 'audit-library')
        t.is(typeof result.libBit.val, 'number')
    },
)

test('AUDIT_LIBRARY -- action class preserves type constant and implements Action<LibraryBit>', (t) => {
    const slv = sinon.fake()
    const bal = { src: 'data/versions.json', slv } as any
    const action = new AuditLibrary(bal)

    t.is(action.type, AUDIT_LIBRARY)
    t.is(action.type, '[Audit action] Audit Library')
    t.is(action.bale?.src, 'data/versions.json')
})

test('auditLibrary -- routes through reducer using clone(model, true) without in-place mutation', async (t) => {
    const slv = sinon.fake()
    const bal = { src: 'data/versions.json', slv } as any
    const action = new AuditLibrary(bal)
    const initialModel = new LibraryModel()

    const reducedModel = await reducer(initialModel, action, null as any)

    t.truthy(reducedModel, 'Reducer must return state model')
    t.not(
        reducedModel,
        initialModel,
        'Reducer must return cloned model instance',
    )
    t.true(slv.calledOnce, 'bal.slv must be invoked by auditLibrary buzzer')

    const response = slv.firstCall.args[0]
    t.is(response.libBit.idx, 'audit-library')
})
