import test from 'ava'
import sinon from 'sinon'
import path from 'path'
import fs from 'fs-extra'
import { DirectiveModel } from '../995.library/06.directive.unit/directive.model'
import { dayDirective } from '../995.library/06.directive.unit/buz/directive.buzz'

test.serial(
    'dayDirective [DIRECTIVE_WORKDAY_SEQUENCER] -- creates sequential day-005 and provisions template files',
    async (t) => {
        const scratchRoot = path.resolve(process.cwd(), 'scratch_test_directive_sequencer')
        await fs.ensureDir(scratchRoot)

        const directiveDir = path.join(scratchRoot, 'data', 'directive')
        await fs.ensureDir(directiveDir)

        // Seed day-000 through day-004
        await fs.ensureDir(path.join(directiveDir, 'day-000'))
        await fs.writeFile(
            path.join(directiveDir, 'day-000', '800.refinement.cpn'),
            '# Refinement Content',
            'utf8',
        )
        await fs.writeFile(
            path.join(directiveDir, 'day-000', '900.check-list.cpn'),
            '# Check List Content',
            'utf8',
        )
        await fs.ensureDir(path.join(directiveDir, 'day-001'))
        await fs.ensureDir(path.join(directiveDir, 'day-002'))
        await fs.ensureDir(path.join(directiveDir, 'day-003'))
        await fs.ensureDir(path.join(directiveDir, 'day-004'))

        await fs.ensureDir(path.join(scratchRoot, 'apps'))
        await fs.ensureDir(path.join(scratchRoot, 'packages'))
        await fs.writeJson(path.join(scratchRoot, 'package.json'), {
            name: 'test-monorepo',
            workspaces: ['apps/*', 'packages/*'],
        })

        t.teardown(async () => {
            await fs.remove(scratchRoot).catch(() => {})
        })

        let resolvedResult: any = null
        const bal = {
            slv: (res: any) => {
                resolvedResult = res
            },
        }

        const loggedLines: string[] = []
        const mockSte: any = {
            hunt: sinon.spy(async (actionType: string, payload: any) => {
                if (payload?.src) loggedLines.push(payload.src)
                return {}
            }),
        }

        const originalCwd = process.cwd
        process.cwd = () => scratchRoot

        try {
            await dayDirective(new DirectiveModel(), bal as any, mockSte)
        } finally {
            process.cwd = originalCwd
        }

        t.truthy(resolvedResult, 'dayDirective must invoke bal.slv')
        t.is(resolvedResult.drtBit.idx, 'day-directive')
        t.is(resolvedResult.drtBit.val, 5, 'Next index after day-004 must be 5')
        t.is(resolvedResult.dayBit.idx, 'day-005')

        const expectedDayDir = path.join(directiveDir, 'day-005')
        t.true(await fs.pathExists(expectedDayDir), 'Must create directory data/directive/day-005')

        // Assert all 4 template files exist
        t.true(await fs.pathExists(path.join(expectedDayDir, '000.focus.cpn')))
        t.true(await fs.pathExists(path.join(expectedDayDir, '000.xxxx.jules')))
        t.true(await fs.pathExists(path.join(expectedDayDir, '000.xxxxx.ag-test')))
        t.true(await fs.pathExists(path.join(expectedDayDir, '000.xxxxx.gravity')))

        // Assert copied files from day-000 exist and match source content
        t.true(await fs.pathExists(path.join(expectedDayDir, '800.refinement.cpn')))
        t.true(await fs.pathExists(path.join(expectedDayDir, '900.check-list.cpn')))
        t.is(
            await fs.readFile(path.join(expectedDayDir, '800.refinement.cpn'), 'utf8'),
            '# Refinement Content',
        )
        t.is(
            await fs.readFile(path.join(expectedDayDir, '900.check-list.cpn'), 'utf8'),
            '# Check List Content',
        )
    },
)

test.serial(
    'dayDirective [DIRECTIVE_WORKDAY_SEQUENCER] -- defaults to day-000 when data/directive is empty',
    async (t) => {
        const scratchEmpty = path.resolve(process.cwd(), 'scratch_test_directive_empty')
        await fs.ensureDir(scratchEmpty)

        await fs.ensureDir(path.join(scratchEmpty, 'apps'))
        await fs.ensureDir(path.join(scratchEmpty, 'packages'))
        await fs.writeJson(path.join(scratchEmpty, 'package.json'), {
            name: 'empty-monorepo',
            workspaces: ['apps/*', 'packages/*'],
        })

        t.teardown(async () => {
            await fs.remove(scratchEmpty).catch(() => {})
        })

        let resolvedResult: any = null
        const bal = {
            slv: (res: any) => {
                resolvedResult = res
            },
        }

        const originalCwd = process.cwd
        process.cwd = () => scratchEmpty

        try {
            await dayDirective(new DirectiveModel(), bal as any, null as any)
        } finally {
            process.cwd = originalCwd
        }

        t.truthy(resolvedResult)
        t.is(resolvedResult.drtBit.val, 0)
        t.is(resolvedResult.dayBit.idx, 'day-000')

        const expectedDayDir = path.join(scratchEmpty, 'data', 'directive', 'day-000')
        t.true(await fs.pathExists(expectedDayDir))
        t.true(await fs.pathExists(path.join(expectedDayDir, '000.focus.cpn')))
        t.true(await fs.pathExists(path.join(expectedDayDir, '800.refinement.cpn')))
        t.true(await fs.pathExists(path.join(expectedDayDir, '900.check-list.cpn')))
    },
)
