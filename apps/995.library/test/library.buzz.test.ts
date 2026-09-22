import test from 'ava'
import sinon from 'sinon'
import path from 'path'
import fs from 'fs-extra'
import { LibraryModel } from '../995.library/00.library.unit/library.model'
import { flatLibrary } from '../995.library/00.library.unit/buz/library.buzz'

function makeBal() {
    return { slv: sinon.fake() } as any
}

function makeModel() {
    return new LibraryModel()
}

const ste = null as any

test.serial(
    'flatLibrary — writes flattened code to root data/flat, not apps/data',
    async (t) => {
        const bal = makeBal()
        await flatLibrary(makeModel(), bal, ste)

        t.true(bal.slv.calledOnce, 'bal.slv should be called once')
        const result = bal.slv.firstCall.args[0]
        t.is(result.libBit.idx, 'flat-library')

        const relativeOutputPath = result.libBit.src
        // Must start with data/flat/ or data/flat, never apps/data
        t.true(
            relativeOutputPath.startsWith('data/flat/'),
            `Path must start with data/flat/, got: ${relativeOutputPath}`,
        )
        t.false(
            relativeOutputPath.includes('apps/data'),
            'Path must not include apps/data',
        )

        // Find repo root to confirm physical file existence
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
        t.true(
            fs.existsSync(absoluteOutputFile),
            `File should exist on disk at ${absoluteOutputFile}`,
        )

        const content = await fs.readFile(absoluteOutputFile, 'utf8')
        t.true(
            content.length > 0,
            'Flattened content should not be empty (should contain code files)',
        )
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

        // Teardown: delete the generated test output file
        await fs.remove(absoluteOutputFile)
    },
)
