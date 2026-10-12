import test from 'ava'
import path from 'path'
import fs from 'fs-extra'
import { DirectiveModel } from '../995.library/06.directive.unit/directive.model'
import { phaseDirective } from '../995.library/06.directive.unit/buz/directive.buzz'

test.serial(
    'phaseDirective [PHASE_DIRECTIVE_INCREMENTER] -- increments phase-one to phase-two with correct 3-digit prefixes',
    async (t) => {
        const scratchRoot = path.resolve(
            process.cwd(),
            'scratch_test_phase_directive',
        )
        await fs.ensureDir(scratchRoot)

        const day000Dir = path.join(scratchRoot, 'data', 'directive', 'day-000')
        const day004Dir = path.join(scratchRoot, 'data', 'directive', 'day-004')
        await fs.ensureDir(path.join(scratchRoot, 'apps'))
        await fs.ensureDir(path.join(scratchRoot, 'packages'))
        await fs.ensureDir(day000Dir)
        await fs.ensureDir(day004Dir)

        await fs.writeFile(
            path.join(day000Dir, '000.xxxx.jules.md'),
            '# Jules Seed Template Content',
            'utf8',
        )
        await fs.writeFile(
            path.join(day000Dir, '000.xxxxx.ag-test.md'),
            '# AG-Test Seed Template Content',
            'utf8',
        )

        await fs.writeFile(path.join(day004Dir, '000.focus.cpn'), '')
        await fs.writeFile(
            path.join(day004Dir, '001.pipeline-refactor.cpn'),
            '',
        )
        await fs.writeFile(path.join(day004Dir, '002.phase-one.jules.md'), '')
        await fs.writeFile(path.join(day004Dir, '003.phase-one.gravity.md'), '')

        await fs.writeJson(path.join(scratchRoot, 'package.json'), {
            name: 'test-monorepo',
            workspaces: ['apps/*', 'packages/*'],
        })

        t.teardown(async () => {
            await fs.remove(scratchRoot).catch(() => {})
        })

        let resolvedResult: any = null
        const bal = {
            src: 'day-004',
            slv: (res: any) => {
                resolvedResult = res
            },
        }

        const originalCwd = process.cwd
        process.cwd = () => scratchRoot

        try {
            await phaseDirective(new DirectiveModel(), bal as any, null as any)
        } finally {
            process.cwd = originalCwd
        }

        t.truthy(resolvedResult, 'Must invoke bal.slv')
        t.is(resolvedResult.drtBit.idx, 'phase-directive')
        t.is(resolvedResult.drtBit.val, 2, 'Incremented phase value must be 2')
        t.is(resolvedResult.drtBit.dat.phaseWord, 'two')

        const expectedFile1 = path.join(day004Dir, '004.phase-two.jules.md')
        const expectedFile2 = path.join(day004Dir, '005.phase-two.ag-test.md')

        t.true(
            await fs.pathExists(expectedFile1),
            '004.phase-two.jules.md must exist on disk',
        )
        t.true(
            await fs.pathExists(expectedFile2),
            '005.phase-two.ag-test.md must exist on disk',
        )

        const julesContent = await fs.readFile(expectedFile1, 'utf8')
        t.is(julesContent, '# Jules Seed Template Content')

        const agTestContent = await fs.readFile(expectedFile2, 'utf8')
        t.is(agTestContent, '# AG-Test Seed Template Content')
    },
)

test.serial(
    'phaseDirective [PHASE_DIRECTIVE_INCREMENTER] -- increments phase-two to phase-three across sequential calls',
    async (t) => {
        const scratchRoot = path.resolve(
            process.cwd(),
            'scratch_test_phase_chain',
        )
        await fs.ensureDir(scratchRoot)

        const day000Dir = path.join(scratchRoot, 'data', 'directive', 'day-000')
        const day005Dir = path.join(scratchRoot, 'data', 'directive', 'day-005')
        await fs.ensureDir(path.join(scratchRoot, 'apps'))
        await fs.ensureDir(path.join(scratchRoot, 'packages'))
        await fs.ensureDir(day000Dir)
        await fs.ensureDir(day005Dir)

        await fs.writeFile(
            path.join(day000Dir, '000.xxxx.jules.md'),
            '# Jules Seed',
        )
        await fs.writeFile(
            path.join(day000Dir, '000.xxxxx.ag-test.md'),
            '# AG-Test Seed',
        )

        await fs.writeFile(path.join(day005Dir, '001.divider.cpn'), '')
        await fs.writeFile(path.join(day005Dir, '002.phase-one.jules.md'), '')
        await fs.writeFile(path.join(day005Dir, '003.phase-one.ag-test.md'), '')
        await fs.writeFile(path.join(day005Dir, '004.phase-two.jules.md'), '')
        await fs.writeFile(path.join(day005Dir, '005.phase-two.ag-test.md'), '')

        await fs.writeJson(path.join(scratchRoot, 'package.json'), {
            name: 'test-monorepo',
            workspaces: ['apps/*', 'packages/*'],
        })

        t.teardown(async () => {
            await fs.remove(scratchRoot).catch(() => {})
        })

        let resolvedResult: any = null
        const bal = {
            src: 'day-005',
            slv: (res: any) => {
                resolvedResult = res
            },
        }

        const originalCwd = process.cwd
        process.cwd = () => scratchRoot

        try {
            await phaseDirective(new DirectiveModel(), bal as any, null as any)
        } finally {
            process.cwd = originalCwd
        }

        t.truthy(resolvedResult)
        t.is(resolvedResult.drtBit.val, 3)
        t.is(resolvedResult.drtBit.dat.phaseWord, 'three')

        t.true(
            await fs.pathExists(
                path.join(day005Dir, '006.phase-three.jules.md'),
            ),
        )
        t.true(
            await fs.pathExists(
                path.join(day005Dir, '007.phase-three.ag-test.md'),
            ),
        )
    },
)

test.serial(
    'phaseDirective [PHASE_DIRECTIVE_INCREMENTER] -- defaults to phase-one if no phase files exist',
    async (t) => {
        const scratchRoot = path.resolve(
            process.cwd(),
            'scratch_test_phase_fresh',
        )
        await fs.ensureDir(scratchRoot)

        const day000Dir = path.join(scratchRoot, 'data', 'directive', 'day-000')
        const day006Dir = path.join(scratchRoot, 'data', 'directive', 'day-006')
        await fs.ensureDir(path.join(scratchRoot, 'apps'))
        await fs.ensureDir(path.join(scratchRoot, 'packages'))
        await fs.ensureDir(day000Dir)
        await fs.ensureDir(day006Dir)

        await fs.writeFile(path.join(day000Dir, '000.xxxx.jules.md'), 'Jules')
        await fs.writeFile(
            path.join(day000Dir, '000.xxxxx.ag-test.md'),
            'AG-Test',
        )

        await fs.writeFile(path.join(day006Dir, '001.bootstrap.cpn'), '')

        await fs.writeJson(path.join(scratchRoot, 'package.json'), {
            name: 'test-monorepo',
            workspaces: ['apps/*', 'packages/*'],
        })

        t.teardown(async () => {
            await fs.remove(scratchRoot).catch(() => {})
        })

        let resolvedResult: any = null
        const bal = {
            src: 'day-006',
            slv: (res: any) => {
                resolvedResult = res
            },
        }

        const originalCwd = process.cwd
        process.cwd = () => scratchRoot

        try {
            await phaseDirective(new DirectiveModel(), bal as any, null as any)
        } finally {
            process.cwd = originalCwd
        }

        t.truthy(resolvedResult)
        t.is(resolvedResult.drtBit.val, 1)
        t.is(resolvedResult.drtBit.dat.phaseWord, 'one')

        t.true(
            await fs.pathExists(path.join(day006Dir, '002.phase-one.jules.md')),
        )
        t.true(
            await fs.pathExists(
                path.join(day006Dir, '003.phase-one.ag-test.md'),
            ),
        )
    },
)
