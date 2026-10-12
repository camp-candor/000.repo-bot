/* eslint-disable */
import 'dotenv/config'
import { program } from 'commander'
import { exec as execCb } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import fs from 'fs'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const exec = promisify(execCb)

// 1. Setup CLI
program.option('--first').option('-t, --separator <char>')
program.parse(process.argv)
const options = program.opts()

export interface PackageTerminalMetadata {
    name: string
    globalKey: string
    menuTitle: string
    menuDesc: string
    targetDir: string
}

/**
 * Sweeps packages/ for valid TypeScript packages and extracts Schema-Driven metadata.
 */
export const getExistingPackages = (): PackageTerminalMetadata[] => {
    const packagesDir = path.resolve(import.meta.dirname, '../../packages')
    if (!fs.existsSync(packagesDir)) return []

    const entries = fs.readdirSync(packagesDir, { withFileTypes: true })
    const results: PackageTerminalMetadata[] = []

    for (const entry of entries) {
        if (!entry.isDirectory() || entry.name === 'dist') continue
        const targetDir = path.join(packagesDir, entry.name)
        const tsconfigPath = path.join(targetDir, 'tsconfig.json')
        if (!fs.existsSync(tsconfigPath)) continue

        const pkgJsonPath = path.join(targetDir, 'package.json')
        let terminalMeta: any = null

        if (fs.existsSync(pkgJsonPath)) {
            try {
                const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'))
                if (pkgJson.terminal) {
                    terminalMeta = pkgJson.terminal
                }
            } catch {
                // Ignore parse errors on intermediate files
            }
        }

        if (terminalMeta && terminalMeta.globalKey && terminalMeta.menuTitle) {
            results.push({
                name: entry.name,
                globalKey: terminalMeta.globalKey,
                menuTitle: terminalMeta.menuTitle,
                menuDesc:
                    terminalMeta.menuDesc ||
                    `Open ${entry.name} management console.`,
                targetDir,
            })
        } else {
            // Heuristic Fallback
            const domain = entry.name.includes('.')
                ? entry.name.split('.').slice(1).join('.')
                : entry.name
            const upper = domain.toUpperCase()
            results.push({
                name: entry.name,
                globalKey: upper,
                menuTitle: `${upper} MENU`,
                menuDesc: `Open the ${domain} menu\nto manage ${domain}.`,
                targetDir,
            })
        }
    }

    return results
}

const getRootIdentity = () => {
    let curr = process.cwd()
    while (curr && curr !== path.dirname(curr)) {
        const pkgPath = path.join(curr, 'package.json')
        if (fs.existsSync(pkgPath)) {
            try {
                const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
                if (pkg.workspaces || fs.existsSync(path.join(curr, '.git'))) {
                    const rawName =
                        pkg.name || path.basename(curr) || '995.library'
                    const name = String(rawName)
                        .replace(/^@[^/]+\//, '')
                        .trim()
                    const rawVersion = pkg.version
                        ? String(pkg.version).replace(/^v/, '')
                        : '0.1.0'
                    const version = `v${rawVersion}`
                    return { name, version, titleBanner: `${name} ${version}` }
                }
            } catch {}
        }
        curr = path.dirname(curr)
    }
    return {
        name: '995.library',
        version: 'v0.1.0',
        titleBanner: '995.library v0.1.0',
    }
}

// 2. Post-Build Initialization Logic
const init = async () => {
    console.log('>> [INIT] Bootstrapping Terminal Orchestrator...')

    global.window = global as any
    ;(global as any).PIVOTS = (global as any).PIVOTS || {}

    const idx = options.separator
    if (idx) console.log(`   Targeting: ${idx}`)

    const libPath = path.resolve(import.meta.dirname, './dist/995.library')
    const existingPackages = getExistingPackages()

    try {
        const LIBRARY = require(path.join(libPath, 'hunt'))
        global.LIBRARY = LIBRARY

        const LIBRARY_ACTION = require(
            path.join(libPath, '00.library.unit/library.action'),
        )

        await LIBRARY.hunt(LIBRARY_ACTION.INIT_LIBRARY, {
            val: 1,
            dat: null,
            src: null,
            idx: idx,
        })

        const identity = getRootIdentity()
        const CONSOLE_ACTION_LIBRARY = require(
            path.join(libPath, '83.console.unit/console.action'),
        )
        const cnsBit = await LIBRARY.hunt(CONSOLE_ACTION_LIBRARY.READ_CONSOLE, {
            idx: 'cns00',
        })
        const logWidget = cnsBit?.cnsBit?.dat?.bit
        if (logWidget && Array.isArray(logWidget.logLines)) {
            const libPkgPath = path.resolve(
                import.meta.dirname,
                './package.json',
            )
            const libPkg = fs.existsSync(libPkgPath)
                ? JSON.parse(fs.readFileSync(libPkgPath, 'utf8'))
                : { version: '1.0.12' }
            logWidget.logLines = [
                '-----------',
                `${identity.name} ${identity.version}`,
                `LIBRARY V${libPkg.version}`,
                '-----------',
            ]
            logWidget.setItems(logWidget.logLines)
            if (logWidget.screen) logWidget.screen.render()
        }

        const MENU_ACTION_LIBRARY = require(
            path.join(libPath, '98.menu.unit/menu.action'),
        )

        await new Promise((resolve) => setTimeout(resolve, 10))

        await LIBRARY.hunt(CONSOLE_ACTION_LIBRARY.UPDATE_CONSOLE, {
            idx: 'cns00',
            src: '>> [OK] Master Bus Initialized',
        })

        // 3. Dynamic Package Injection & Bus Wiring
        const packagesDist = path.resolve(
            import.meta.dirname,
            '../../packages/dist',
        )
        if (fs.existsSync(packagesDist)) {
            const distPkgJson = path.join(packagesDist, 'package.json')
            if (!fs.existsSync(distPkgJson)) {
                fs.writeFileSync(
                    distPkgJson,
                    JSON.stringify({ type: 'commonjs' }, null, 2),
                )
            }
        }

        for (const pkg of existingPackages) {
            try {
                let pkgDistPath = path.resolve(
                    import.meta.dirname,
                    `../../packages/dist/${pkg.name}`,
                )
                if (!fs.existsSync(pkgDistPath)) {
                    const localDist = path.resolve(
                        import.meta.dirname,
                        `../../packages/${pkg.name}/dist`,
                    )
                    if (fs.existsSync(localDist)) {
                        pkgDistPath = localDist
                    } else {
                        pkgDistPath = pkg.targetDir
                    }
                }

                const huntModulePath = path.join(pkgDistPath, 'hunt')
                const MODULE = require(huntModulePath)
                const instance = MODULE.default || MODULE

                // Inject into global namespace & central pivot registry
                ;(global as any)[pkg.globalKey] = instance
                ;(global as any).PIVOTS[pkg.name] = instance
                ;(global as any).PIVOTS[pkg.globalKey] = instance

                const menuActionPath = path.join(
                    pkgDistPath,
                    '98.menu.unit/menu.action',
                )
                if (
                    !fs.existsSync(menuActionPath + '.js') &&
                    !fs.existsSync(menuActionPath + '.ts') &&
                    !fs.existsSync(menuActionPath)
                ) {
                    // Headless pivot without visual menu unit
                    await LIBRARY.hunt(CONSOLE_ACTION_LIBRARY.UPDATE_CONSOLE, {
                        idx: 'cns00',
                        src: `>> [INFO] Mounted headless pivot: [${pkg.name}] as global.${pkg.globalKey}`,
                    })
                    continue
                }

                const MENU_ACTION = require(menuActionPath)

                // Mount sub-menu into root Blessed navigation
                await LIBRARY.hunt(MENU_ACTION_LIBRARY.ROUTE_MENU, {
                    idx: pkg.menuTitle,
                    src: pkg.menuDesc,
                    fnc: async () => {
                        await new Promise<void>((resolve) => {
                            ;(global as any)[pkg.globalKey].hunt(
                                MENU_ACTION.INIT_MENU,
                                {
                                    slv: resolve,
                                },
                            )
                        })
                        await LIBRARY.hunt(MENU_ACTION_LIBRARY.OPEN_MENU, {
                            src: '',
                        })
                    },
                })

                await LIBRARY.hunt(CONSOLE_ACTION_LIBRARY.UPDATE_CONSOLE, {
                    idx: 'cns00',
                    src: `>> [OK] Mounted UI Pivot: [${pkg.name}] -> ${pkg.menuTitle}`,
                })
            } catch (err: any) {
                await LIBRARY.hunt(CONSOLE_ACTION_LIBRARY.UPDATE_CONSOLE, {
                    idx: 'cns00',
                    src: `:: [WARN] Skipping pivot [${pkg.name}]: ${err.message}`,
                })
            }
        }

        await LIBRARY.hunt(MENU_ACTION_LIBRARY.OPEN_MENU, { src: '' })
    } catch (err: any) {
        console.error(':: [FAIL] Terminal Runtime Panic:', err)
        process.exit(1)
    }
}

// 4. Main Build & Startup Pipeline
const main = async () => {
    try {
        console.log('>> [BUILD] Compiling Monorepo TypeScript References...')
        const existingPackages = getExistingPackages()
        const buildTargets = [
            '995.library',
            ...existingPackages.map((p) => `../../packages/${p.name}`),
        ].join(' ')

        var { stdout, stderr } = await exec(`tsc -b ${buildTargets}`, {
            cwd: import.meta.dirname,
        })

        if (stdout) console.log(stdout)
        if (stderr) console.error(stderr)

        await init()
    } catch (err: any) {
        console.error(':: [FAIL] Build Failed:')
        console.error(err.stdout || err.message)
        process.exit(1)
    }
}

main()
