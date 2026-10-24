import test from 'ava'
import sinon from 'sinon'
import path from 'path'
import fs from 'fs-extra'
import { DirectiveModel } from '../995.library/06.directive.unit/directive.model'
import { createDirective, toSlug } from '../995.library/06.directive.unit/buz/directive.buzz'

test('toSlug helper -- normalizes spaces, punctuation, and casing to hyphens', (t) => {
    t.is(toSlug('moderize media pipeline'), 'moderize-media-pipeline')
    t.is(toSlug('Modernize Media Pipeline'), 'modernize-media-pipeline')
    t.is(toSlug('  heavy__media   pipeline!  '), 'heavy-media-pipeline')
    t.is(toSlug('special@#$_tokens!!'), 'special-tokens')
    t.is(toSlug(''), 'focus')
})

test.serial(
    'createDirective [SLUGIFICATION] -- automatically slugifies focus label with spaces into clean divider filename',
    async (t) => {
        const scratchRoot = path.resolve(process.cwd(), 'scratch_test_slug_directive')
        await fs.ensureDir(scratchRoot)

        const day005Dir = path.join(scratchRoot, 'data', 'directive', 'day-005')
        const day000Dir = path.join(scratchRoot, 'data', 'directive', 'day-000')

        await fs.ensureDir(day005Dir)
        await fs.ensureDir(day000Dir)

        await fs.writeFile(path.join(day005Dir, '000.focus.cpn'), '// Focus divider template')


        await fs.writeFile(path.join(day000Dir, '000.focus.cpn'), '// Focus divider template')
        await fs.writeFile(path.join(day000Dir, '000.xxxx.jules.md'), '# Jules template')
        await fs.writeFile(path.join(day000Dir, '000.xxxxx.ag-test.md'), '# AG-Test template')

        await fs.writeJson(path.join(scratchRoot, 'package.json'), {
            name: 'test-monorepo',
            workspaces: ['apps/*', 'packages/*'],
        })
        await fs.ensureDir(path.join(scratchRoot, 'apps'))
        await fs.ensureDir(path.join(scratchRoot, 'packages'))

        t.teardown(async () => {
            await fs.remove(scratchRoot).catch(() => {})
        })

        let resolvedResult: any = null
        const bal = {
            src: 'day-005',
            idx: 'moderize media pipeline', // Label entered with spaces
            val: 3, // 3 phases
            slv: (res: any) => {
                resolvedResult = res
            },
        }

        const originalCwd = process.cwd
        process.cwd = () => scratchRoot

        try {
            await createDirective(new DirectiveModel(), bal as any, null as any)
        } finally {
            process.cwd = originalCwd
        }

        t.truthy(resolvedResult, 'createDirective must invoke bal.slv')
        t.is(resolvedResult.drtBit.idx, 'create-directive')
        t.is(resolvedResult.drtBit.val, 7, '1 divider + (3 phases * 2 files) = 7 files total')

        // Assert label was slugified in return payload
        t.is(resolvedResult.drtBit.dat.label, 'moderize-media-pipeline')

        // Assert exact file was created on disk with hyphens instead of spaces
        const expectedDividerName = '001.moderize-media-pipeline.cpn'
        t.is(resolvedResult.drtBit.dat.files[0], expectedDividerName)
        t.true(
            await fs.pathExists(path.join(day005Dir, expectedDividerName)),
            'Divider file must exist on disk with slugified name: 001.moderize-media-pipeline.cpn',
        )

        // Negative assertion: File with spaces must NOT exist
        t.false(
            await fs.pathExists(path.join(day005Dir, '001.moderize media pipeline.cpn')),
            'File with spaces must not be created',
        )
    },
)

test.serial(
    'createDirective [PHASE_DIRECTIVE_SCAFFOLDER] -- scaffolds divider and phase pairs sequentially',
    async (t) => {
        const scratchRoot = path.resolve(process.cwd(), 'scratch_test_create_directive')
        await fs.ensureDir(scratchRoot)

        const day000Dir = path.join(scratchRoot, 'data', 'directive', 'day-000')
        const day003Dir = path.join(scratchRoot, 'data', 'directive', 'day-003')

        await fs.ensureDir(day000Dir)
        await fs.ensureDir(day003Dir)

        // Seed day-000 templates
        await fs.writeFile(path.join(day000Dir, '000.focus.cpn'), '// Focus divider template')
        await fs.writeFile(path.join(day000Dir, '000.xxxx.jules.md'), '# Jules task template')
        await fs.writeFile(path.join(day000Dir, '000.xxxxx.ag-test.md'), '# AG-Test verification template')

        // Seed existing files in day-003 up to 000
        await fs.writeFile(path.join(day003Dir, '000.focus.cpn'), '// Initial day-003 focus')

        await fs.writeJson(path.join(scratchRoot, 'package.json'), {
            name: 'test-monorepo',
            workspaces: ['apps/*', 'packages/*'],
        })
        await fs.ensureDir(path.join(scratchRoot, 'apps'))
        await fs.ensureDir(path.join(scratchRoot, 'packages'))

        t.teardown(async () => {
            await fs.remove(scratchRoot).catch(() => {})
        })

        let resolvedResult: any = null
        const bal = {
            src: 'day-003',
            idx: 'modernize-media-pipeline',
            val: 2, // 2 phases requested
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
            await createDirective(new DirectiveModel(), bal as any, mockSte)
        } finally {
            process.cwd = originalCwd
        }

        t.truthy(resolvedResult, 'createDirective must invoke bal.slv')
        t.is(resolvedResult.drtBit.idx, 'create-directive')
        t.is(resolvedResult.drtBit.val, 5, '1 divider + (2 phases * 2 files) = 5 files total')

        // Assert exact sequential files exist in day-003
        t.true(await fs.pathExists(path.join(day003Dir, '001.modernize-media-pipeline.cpn')))
        t.true(await fs.pathExists(path.join(day003Dir, '002.phase-one.jules.md')))
        t.true(await fs.pathExists(path.join(day003Dir, '003.phase-one.ag-test.md')))
        t.true(await fs.pathExists(path.join(day003Dir, '004.phase-two.jules.md')))
        t.true(await fs.pathExists(path.join(day003Dir, '005.phase-two.ag-test.md')))

        // Verify content was transferred from templates
        const cpnContent = await fs.readFile(
            path.join(day003Dir, '001.modernize-media-pipeline.cpn'),
            'utf8',
        )
        t.is(cpnContent, '// Focus divider template')
    },
)

test.serial(
    'createDirective [PHASE_DIRECTIVE_SCAFFOLDER] -- preserves sequence continuation when files already exist',
    async (t) => {
        const scratchRoot = path.resolve(process.cwd(), 'scratch_test_seq_continue')
        await fs.ensureDir(scratchRoot)

        const day003Dir = path.join(scratchRoot, 'data', 'directive', 'day-003')
        await fs.ensureDir(day003Dir)

        // Seed up to index 005
        await fs.writeFile(path.join(day003Dir, '005.phase-two.ag-test.md'), '')

        await fs.writeJson(path.join(scratchRoot, 'package.json'), {
            name: 'test-monorepo',
            workspaces: ['apps/*', 'packages/*'],
        })
        await fs.ensureDir(path.join(scratchRoot, 'apps'))
        await fs.ensureDir(path.join(scratchRoot, 'packages'))

        t.teardown(async () => {
            await fs.remove(scratchRoot).catch(() => {})
        })

        let resolvedResult: any = null
        const bal = {
            src: 'day-003',
            idx: 'enforce-type-contracts',
            val: 1, // 1 phase requested
            slv: (res: any) => {
                resolvedResult = res
            },
        }

        const originalCwd = process.cwd
        process.cwd = () => scratchRoot

        try {
            await createDirective(new DirectiveModel(), bal as any, null as any)
        } finally {
            process.cwd = originalCwd
        }

        t.truthy(resolvedResult)
        // Expected sequence starts at 006
        t.true(await fs.pathExists(path.join(day003Dir, '006.enforce-type-contracts.cpn')))
        t.true(await fs.pathExists(path.join(day003Dir, '007.phase-one.jules.md')))
        t.true(await fs.pathExists(path.join(day003Dir, '008.phase-one.ag-test.md')))
    },
)

test.serial(
    'createDirective [BOUNDARY_RESERVATION] -- ignores boundary files >= 800 (refinement and checklist)',
    async (t) => {
        const scratchRoot = path.resolve(process.cwd(), 'scratch_test_boundary_reserve')
        await fs.ensureDir(scratchRoot)

        const day001Dir = path.join(scratchRoot, 'data', 'directive', 'day-001')
        await fs.ensureDir(day001Dir)

        // Seed 000 templates and 800/900 boundary files as provisioned by dayDirective
        await fs.writeFile(path.join(day001Dir, '000.focus.cpn'), '// Focus template')
        await fs.writeFile(path.join(day001Dir, '800.refinement.cpn'), '// Refinement')
        await fs.writeFile(path.join(day001Dir, '900.check-list.cpn'), '// Checklist')

        await fs.writeJson(path.join(scratchRoot, 'package.json'), {
            name: 'test-monorepo',
            workspaces: ['apps/*', 'packages/*'],
        })
        await fs.ensureDir(path.join(scratchRoot, 'apps'))
        await fs.ensureDir(path.join(scratchRoot, 'packages'))

        t.teardown(async () => {
            await fs.remove(scratchRoot).catch(() => {})
        })

        let resolvedResult: any = null
        const bal = {
            src: 'day-001',
            idx: 'facts-ledger',
            val: 2,
            slv: (res: any) => {
                resolvedResult = res
            },
        }

        const originalCwd = process.cwd
        process.cwd = () => scratchRoot

        try {
            await createDirective(new DirectiveModel(), bal as any, null as any)
        } finally {
            process.cwd = originalCwd
        }

        t.truthy(resolvedResult)
        // Must start at 001, not 901
        t.true(await fs.pathExists(path.join(day001Dir, '001.facts-ledger.cpn')))
        t.true(await fs.pathExists(path.join(day001Dir, '002.phase-one.jules.md')))
        t.true(await fs.pathExists(path.join(day001Dir, '003.phase-one.ag-test.md')))
        t.true(await fs.pathExists(path.join(day001Dir, '004.phase-two.jules.md')))
        t.true(await fs.pathExists(path.join(day001Dir, '005.phase-two.ag-test.md')))
    },
)
