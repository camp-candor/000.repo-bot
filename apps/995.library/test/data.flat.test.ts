import test from 'ava'
import sinon from 'sinon'
import path from 'path'
import fs from 'fs-extra'
import { DataModel } from '../995.library/03.data.unit/data.model'
import { flatData } from '../995.library/03.data.unit/buz/data.buzz'

test.serial(
    'flatData [FLAT_DATA_CONSOLIDATOR] -- combines text/markdown files into target name in data/flat',
    async (t) => {
        const scratchRoot = path.resolve(process.cwd(), 'scratch_test_flat_data')
        await fs.ensureDir(scratchRoot)

        const flattenDir = path.join(scratchRoot, 'data', 'flatten')
        const flatDir = path.join(scratchRoot, 'data', 'flat')
        await fs.ensureDir(flattenDir)
        await fs.ensureDir(flatDir)
        await fs.ensureDir(path.join(scratchRoot, 'apps'))
        await fs.ensureDir(path.join(scratchRoot, 'packages'))

        await fs.writeJson(path.join(scratchRoot, 'package.json'), {
            name: 'test-monorepo',
            workspaces: ['apps/*', 'packages/*'],
        })

        // Seed candidate files in data/flatten
        await fs.writeFile(path.join(flattenDir, '001-spec.md'), '# Specification')
        await fs.writeFile(path.join(flattenDir, '002-notes.txt'), 'Engineering notes')
        await fs.writeFile(path.join(flattenDir, 'ignore.png'), 'BINARY_DATA')

        t.teardown(async () => {
            await fs.remove(scratchRoot).catch(() => {})
        })

        let resolvedResult: any = null
        const bal = {
            src: '001-spec.md',
            slv: (res: any) => {
                resolvedResult = res
            },
        }

        const originalCwd = process.cwd
        process.cwd = () => scratchRoot

        try {
            await flatData(new DataModel(), bal as any, null as any)
        } finally {
            process.cwd = originalCwd
        }

        t.truthy(resolvedResult, 'flatData must invoke bal.slv')
        t.is(resolvedResult.datBit.idx, 'flat-data')
        t.is(resolvedResult.datBit.val, 2, 'Must combine exactly 2 text/markdown files')

        const expectedFile = path.join(flatDir, '001-spec.md')
        t.true(await fs.pathExists(expectedFile), 'Combined file must exist in data/flat/001-spec.md')

        const content = await fs.readFile(expectedFile, 'utf8')
        t.true(content.includes('// ----- SOURCE: data/flatten/001-spec.md -----'))
        t.true(content.includes('# Specification'))
        t.true(content.includes('// ----- SOURCE: data/flatten/002-notes.txt -----'))
        t.true(content.includes('Engineering notes'))
        t.false(content.includes('BINARY_DATA'), 'Must exclude non-text binary files')
    },
)

test.serial(
    'flatData [FLAT_DATA_CONSOLIDATOR] -- fails closed when no text files exist',
    async (t) => {
        const scratchEmpty = path.resolve(process.cwd(), 'scratch_test_flat_empty')
        await fs.ensureDir(scratchEmpty)
        await fs.ensureDir(path.join(scratchEmpty, 'data', 'flatten'))
        await fs.ensureDir(path.join(scratchEmpty, 'apps'))
        await fs.ensureDir(path.join(scratchEmpty, 'packages'))

        await fs.writeJson(path.join(scratchEmpty, 'package.json'), {
            name: 'test-monorepo',
        })

        t.teardown(async () => {
            await fs.remove(scratchEmpty).catch(() => {})
        })

        let resolvedResult: any = null
        const bal = {
            src: 'output.txt',
            slv: (res: any) => {
                resolvedResult = res
            },
        }

        const originalCwd = process.cwd
        process.cwd = () => scratchEmpty

        try {
            await flatData(new DataModel(), bal as any, null as any)
        } finally {
            process.cwd = originalCwd
        }

        t.truthy(resolvedResult)
        t.is(resolvedResult.datBit.idx, 'flat-data-error')
        t.is(resolvedResult.datBit.val, 0)
    },
)

test.serial(
    'flatData [FLAT_DATA_CONSOLIDATOR] -- fails closed when no target file name is provided',
    async (t) => {
        let resolvedResult: any = null
        const bal = {
            src: '',
            slv: (res: any) => {
                resolvedResult = res
            },
        }

        await flatData(new DataModel(), bal as any, null as any)

        t.truthy(resolvedResult)
        t.is(resolvedResult.datBit.idx, 'flat-data-error')
        t.is(resolvedResult.datBit.src, 'No target file name provided for flatData')
    },
)
