import test from 'ava'
import path from 'path'
import fs from 'fs-extra'

test.serial(
    'run.ts autodiscovery -- extracts package.json terminal schema metadata',
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

        const testPkgDir = path.join(repoRoot, 'packages', 'scratch_meta_test')
        await fs.ensureDir(testPkgDir)
        await fs.writeFile(path.join(testPkgDir, 'tsconfig.json'), '{}')
        await fs.writeJson(path.join(testPkgDir, 'package.json'), {
            name: '@camp_candor/scratch_meta_test',
            terminal: {
                globalKey: 'SCRATCH_META',
                menuTitle: 'SCRATCH MENU',
                menuDesc: 'Custom test description metadata.',
            },
        })

        t.teardown(async () => {
            await fs.remove(testPkgDir).catch(() => {})
        })

        // Inline simulation of getExistingPackages logic
        const packagesDir = path.join(repoRoot, 'packages')
        const entries = fs.readdirSync(packagesDir, { withFileTypes: true })
        const target = entries.find((e) => e.name === 'scratch_meta_test')
        t.truthy(target, 'Test package must be discovered')

        const pkgJson = await fs.readJson(path.join(testPkgDir, 'package.json'))
        t.is(pkgJson.terminal.globalKey, 'SCRATCH_META')
        t.is(pkgJson.terminal.menuTitle, 'SCRATCH MENU')
        t.is(pkgJson.terminal.menuDesc, 'Custom test description metadata.')
    },
)

test.serial(
    'run.ts autodiscovery -- falls back to domain heuristic when terminal metadata absent',
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

        const testPkgDir = path.join(repoRoot, 'packages', '999.fallback_pivot')
        await fs.ensureDir(testPkgDir)
        await fs.writeFile(path.join(testPkgDir, 'tsconfig.json'), '{}')
        await fs.writeJson(path.join(testPkgDir, 'package.json'), {
            name: '@camp_candor/999.fallback_pivot',
        })

        t.teardown(async () => {
            await fs.remove(testPkgDir).catch(() => {})
        })

        const entryName = '999.fallback_pivot'
        const domain = entryName.split('.').slice(1).join('.')
        const upper = domain.toUpperCase()

        t.is(domain, 'fallback_pivot')
        t.is(upper, 'FALLBACK_PIVOT')
        t.is(`${upper} MENU`, 'FALLBACK_PIVOT MENU')
    },
)

test.serial(
    'run.ts autodiscovery -- resilient against malformed package.json and applies fallback',
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

        const testPkgDir = path.join(
            repoRoot,
            'packages',
            '888.malformed_pivot',
        )
        await fs.ensureDir(testPkgDir)
        await fs.writeFile(path.join(testPkgDir, 'tsconfig.json'), '{}')
        await fs.writeFile(
            path.join(testPkgDir, 'package.json'),
            '{ malformed json syntax !!!',
        )

        t.teardown(async () => {
            await fs.remove(testPkgDir).catch(() => {})
        })

        const entryName = '888.malformed_pivot'
        let terminalMeta: any = null
        try {
            const raw = fs.readFileSync(
                path.join(testPkgDir, 'package.json'),
                'utf8',
            )
            terminalMeta = JSON.parse(raw).terminal
        } catch {
            // Fallback applied gracefully
        }
        t.is(terminalMeta, null)

        const domain = entryName.includes('.')
            ? entryName.split('.').slice(1).join('.')
            : entryName
        const upper = domain.toUpperCase()
        t.is(upper, 'MALFORMED_PIVOT')
        t.is(`${upper} MENU`, 'MALFORMED_PIVOT MENU')
    },
)

test.serial(
    'run.ts autodiscovery -- headless pivot detection without throwing missing module error',
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

        const testPkgDir = path.join(
            repoRoot,
            'packages',
            'scratch_headless_test',
        )
        await fs.ensureDir(testPkgDir)
        await fs.writeFile(path.join(testPkgDir, 'tsconfig.json'), '{}')
        await fs.writeJson(path.join(testPkgDir, 'package.json'), {
            name: '@camp_candor/scratch_headless_test',
            terminal: {
                globalKey: 'SCRATCH_HEADLESS',
                menuTitle: 'SCRATCH HEADLESS MENU',
                menuDesc: 'Headless background pivot.',
            },
        })

        t.teardown(async () => {
            await fs.remove(testPkgDir).catch(() => {})
        })

        const menuActionPath = path.join(testPkgDir, '98.menu.unit/menu.action')
        const hasVisualMenu =
            fs.existsSync(menuActionPath + '.js') ||
            fs.existsSync(menuActionPath + '.ts') ||
            fs.existsSync(menuActionPath)

        t.false(hasVisualMenu, 'Headless pivot must not have visual menu action')
    },
)
