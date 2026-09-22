import test from 'ava'
import sinon from 'sinon'
import path from 'path'
import fs from 'fs-extra'
import { UnitModel } from '../995.library/01.unit.unit/unit.model'
import { flattenUnit } from '../995.library/01.unit.unit/buz/unit.buzz'

function makeBal(idx: string, src?: string) {
    return { idx, src, slv: sinon.fake() } as any
}

function makeModel() {
    return new UnitModel()
}

const ste = null as any

test.serial(
    'flattenUnit — flattens directory to root data/unit/<name>.txt without node_modules, dist, or data',
    async (t) => {
        // Find repo root
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

        // Create a temporary mock directory inside scratch or tmp folder for deterministic testing
        const tempDir = path.join(repoRoot, 'scratch_test_unit')
        await fs.ensureDir(path.join(tempDir, 'src'))
        await fs.ensureDir(path.join(tempDir, 'node_modules', 'dummy'))
        await fs.ensureDir(path.join(tempDir, 'dist'))
        await fs.ensureDir(path.join(tempDir, 'data'))

        await fs.writeFile(
            path.join(tempDir, 'src', 'index.ts'),
            'export const hello = "world";\n',
        )
        await fs.writeFile(
            path.join(tempDir, 'node_modules', 'dummy', 'index.js'),
            'export const leak = true;\n',
        )
        await fs.writeFile(
            path.join(tempDir, 'dist', 'bundle.js'),
            'export const compiled = true;\n',
        )
        await fs.writeFile(
            path.join(tempDir, 'data', 'store.json'),
            '{"key":"value"}',
        )

        const testIdx = 'test-scratch-unit'
        const bal = makeBal(testIdx, tempDir)

        await flattenUnit(makeModel(), bal, ste)

        t.true(bal.slv.calledOnce, 'bal.slv should be called once')
        const result = bal.slv.firstCall.args[0]
        t.is(result.untBit.idx, 'flatten-unit')

        const relativeOutputPath = result.untBit.src
        t.true(
            relativeOutputPath.startsWith('data/unit/'),
            `Path must start with data/unit/, got: ${relativeOutputPath}`,
        )
        t.true(
            relativeOutputPath.endsWith('.txt'),
            `Path must end with .txt, got: ${relativeOutputPath}`,
        )

        const absoluteOutputFile = path.join(repoRoot, relativeOutputPath)
        t.true(
            fs.existsSync(absoluteOutputFile),
            `File should exist on disk at ${absoluteOutputFile}`,
        )

        const content = await fs.readFile(absoluteOutputFile, 'utf8')
        t.true(
            content.includes('export const hello = "world";'),
            'Should contain source code',
        )
        t.false(content.includes('leak'), 'Must not contain node_modules files')
        t.false(content.includes('compiled'), 'Must not contain dist files')
        t.false(content.includes('store.json'), 'Must not contain data files')

        // Teardown
        await fs.remove(absoluteOutputFile)
        await fs.remove(tempDir)
    },
)
