import test from 'ava'
import sinon from 'sinon'
import path from 'path'
import fs from 'fs-extra'
import { PackageModel } from '../995.library/05.package.unit/package.model'
import { createPackage } from '../995.library/05.package.unit/buz/package.buzz'

test.serial(
    'createPackage [PACKAGE_SCAFFOLD_ENGINE] -- clones packages/103.factory into data/package with token substitutions',
    async (t) => {
        const scratchRoot = path.resolve(process.cwd(), 'scratch_test_pkg_scaffold')
        await fs.ensureDir(scratchRoot)

        const exemplarDir = path.join(scratchRoot, 'packages', '103.factory')
        await fs.ensureDir(path.join(exemplarDir, '00.factory.unit'))
        await fs.ensureDir(path.join(exemplarDir, '98.menu.unit'))

        // Create sample exemplar files
        await fs.writeFile(
            path.join(exemplarDir, 'package.json'),
            JSON.stringify(
                {
                    name: '@camp_candor/103.factory',
                    description: 'Factory package',
                },
                null,
                2,
            ),
        )
        await fs.writeFile(
            path.join(exemplarDir, 'hunt.ts'),
            'export const huntFactory = () => "FACTORY_RUNNING";\nexport class FactoryHarness {}',
        )
        await fs.writeFile(
            path.join(exemplarDir, '00.factory.unit', 'factory.action.ts'),
            'export const INIT_FACTORY = "[Factory action] Init Factory";',
        )

        // Monorepo root anchors
        await fs.writeJson(path.join(scratchRoot, 'package.json'), {
            name: 'monorepo-root',
            workspaces: ['apps/*', 'packages/*'],
        })

        t.teardown(async () => {
            await fs.remove(scratchRoot).catch(() => {})
        })

        let resolvedResult: any = null
        const bal = {
            idx: '104.hotkey',
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
            await createPackage(new PackageModel(), bal as any, mockSte)
        } finally {
            process.cwd = originalCwd
        }

        t.truthy(resolvedResult, 'createPackage must invoke bal.slv')
        t.is(resolvedResult.pkgBit.idx, 'create-package')

        const emittedPackageDir = path.join(scratchRoot, 'data', 'package', '104.hotkey')
        t.true(
            await fs.pathExists(emittedPackageDir),
            'Emitted package must exist in data/package/104.hotkey',
        )

        // Assert file rewriting
        const pkgJson = await fs.readJson(path.join(emittedPackageDir, 'package.json'))
        t.is(pkgJson.name, '@camp_candor/104.hotkey')
        t.is(pkgJson.description, 'Hotkey package')

        const huntContent = await fs.readFile(path.join(emittedPackageDir, 'hunt.ts'), 'utf8')
        t.true(huntContent.includes('huntHotkey'))
        t.true(huntContent.includes('HotkeyHarness'))
        t.true(huntContent.includes('HOTKEY_RUNNING'))
        t.false(huntContent.includes('factory'))

        const actionContent = await fs.readFile(
            path.join(emittedPackageDir, '00.hotkey.unit', 'hotkey.action.ts'),
            'utf8',
        )
        t.true(actionContent.includes('INIT_HOTKEY'))
        t.true(actionContent.includes('[Hotkey action] Init Hotkey'))
    },
)

test.serial(
    'createPackage [PACKAGE_SCAFFOLD_ENGINE] -- fails closed when template exemplar does not exist',
    async (t) => {
        const scratchEmpty = path.resolve(process.cwd(), 'scratch_test_pkg_empty')
        await fs.ensureDir(scratchEmpty)
        await fs.writeJson(path.join(scratchEmpty, 'package.json'), { name: 'empty-root' })

        t.teardown(async () => {
            await fs.remove(scratchEmpty).catch(() => {})
        })

        let resolvedResult: any = null
        const bal = {
            idx: '105.gemini',
            src: 'packages/103.factory',
            slv: (res: any) => {
                resolvedResult = res
            },
        }

        const originalCwd = process.cwd
        process.cwd = () => scratchEmpty

        try {
            await createPackage(new PackageModel(), bal as any, null as any)
        } finally {
            process.cwd = originalCwd
        }

        t.truthy(resolvedResult)
        t.is(resolvedResult.pkgBit.idx, 'create-package-error')
        t.true(resolvedResult.pkgBit.src.includes('Template exemplar packages/103.factory not found'))
    },
)
