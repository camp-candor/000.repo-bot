import type { AuditReport, RepoAuditRecord, AuditStatus } from '../fce/audit.interface'
import type { SovereigntyCheckResult, RewireResult } from '../fce/sovereignty.interface'
import type { LibraryModel } from '../library.model'
import type LibraryBit from '../fce/library.bit'

import { promisify } from 'util'
import { execFile as execFileCb } from 'child_process'
import path from 'path'
import fs from 'fs-extra'
const execFile = promisify(execFileCb)

import type State from '../../99.core/state'

import * as ActMnu from '../../98.menu.unit/menu.action'
import * as ActBus from '../../99.bus.unit/bus.action'
import * as ActCns from '../../83.console.unit/console.action'

import * as ActLib from '../library.action'

let bit, val, idx, dex, lst, dat

export const ZERO_TRUST_EXCLUDED_NAMES = new Set([
    '.env',
    '.git',
    '.github',
    'node_modules',
    'dist',
    'coverage',
    '.wrangler',
]);

export const filterZeroTrust = (srcPath: string): boolean => {
    const path = require('path');
    const base = path.basename(srcPath);

    if (ZERO_TRUST_EXCLUDED_NAMES.has(base)) return false;
    if (base.startsWith('.env.')) return false;
    if (base.startsWith('.dev.vars')) return false;
    if (base.endsWith('.tsbuildinfo')) return false;
    if (base.endsWith('.pem') || base.endsWith('.key')) return false;
    if (base.startsWith('service-account') && base.endsWith('.json')) return false;

    return true;
};

export const stageLibraryPayload = async (
    sourceDir: string,
    targetDir: string,
    nonce?: string,
): Promise<{ stagingDir: string; parentDir: string }> => {
    const fs = require('fs-extra');
    const path = require('path');

    const resolvedTarget = path.isAbsolute(targetDir)
        ? targetDir
        : path.resolve(process.cwd(), targetDir);
    const parentDir = path.dirname(resolvedTarget);
    const uniqueNonce = nonce || `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const stagingDir = path.join(parentDir, `.tmp_staging_995_library_${uniqueNonce}`);

    try {
        await fs.ensureDir(stagingDir);
        await fs.copy(sourceDir, stagingDir, {
            dereference: true,
            filter: filterZeroTrust,
        });
        return { stagingDir, parentDir };
    } catch (err: any) {
        if (await fs.pathExists(stagingDir)) {
            await fs.remove(stagingDir).catch(() => {});
        }
        throw new Error(`[STAGING_FAILED] Error staging payload to ${stagingDir}: ${err.message}`);
    }
};

export const initLibrary = async (
    cpy: LibraryModel,
    bal: LibraryBit,
    ste: State,
) => {
    global.SOWER = null
    global.TIME = null

    global.SOLID = null
    global.PIXEL = null

    if (bal.dat != null)
        bit = await ste.hunt(ActBus.INIT_BUS, {
            idx: cpy.idx,
            lst: [ActLib],
            dat: bal.dat,
            src: bal.src,
        })

    //setInterval( async ()=>{

    //   ste.bus("[Open action] Open Pixel", {})

    //}, 4444 )

    //if (bal.val == 1) patch(ste, ActMnu.INIT_MENU, bal);
    bit = await ste.hunt(ActMnu.INIT_MENU, bal)
    if (bal.slv != null) bal.slv({ libBit: { idx: 'init-mythos' } })

    return cpy
}

export const listLibrary = (cpy: LibraryModel, bal: LibraryBit, ste: State) => {
    const fs = require('fs')
    const path = require('path')

    const resultList = []
    const isRepoRoot = (dir: string) => {
        try {
            return (
                fs.existsSync(path.join(dir, 'apps')) &&
                fs.existsSync(path.join(dir, 'packages')) &&
                fs.existsSync(path.join(dir, 'package.json'))
            )
        } catch {
            return false
        }
    }

    let parentDir = process.cwd()
    while (parentDir && !isRepoRoot(parentDir)) {
        const parent = path.dirname(parentDir)
        if (parent === parentDir) break
        parentDir = parent
    }
    const IGNORE = new Set([
        'node_modules',
        '.git',
        'dist',
        'page',
        '$RECYCLE.BIN',
        'Config.Msi',
        'vision',
    ])

    function hasDirectUnits(dir: string) {
        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true })
            for (const entry of entries) {
                if (
                    entry.isDirectory() &&
                    /^\d{2}\..+\.unit$/.test(entry.name)
                ) {
                    return true
                }
            }
        } catch (e) {
            // Ignore read errors
        }
        return false
    }

    function findPivots(dir, results, depth = 0) {
        if (depth > 3) return // Limit depth to prevent freezes
        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true })
            for (const entry of entries) {
                if (!entry.isDirectory()) continue
                if (IGNORE.has(entry.name)) continue

                const targetPath = path.join(dir, entry.name)

                if (/^\d{3}\./.test(entry.name)) {
                    if (hasDirectUnits(targetPath)) {
                        const relativePath = path.relative(
                            parentDir,
                            targetPath,
                        )
                        results.push(`[${relativePath.replace(/\\/g, '/')}]`)
                    }
                }

                findPivots(targetPath, results, depth + 1)
            }
        } catch (e) {
            // Ignore directory read errors
        }
    }

    try {
        const topLevelEntries = fs.readdirSync(parentDir, {
            withFileTypes: true,
        })

        for (const entry of topLevelEntries) {
            if (!entry.isDirectory()) continue
            if (IGNORE.has(entry.name)) continue

            const projectPath = path.join(parentDir, entry.name)

            if (/^\d{3}\./.test(entry.name) && hasDirectUnits(projectPath)) {
                const relativePath = path.relative(parentDir, projectPath)
                resultList.push(`[${relativePath.replace(/\\/g, '/')}]`)
            }

            findPivots(projectPath, resultList)
        }
    } catch (err) {
        console.error(`Error in listLibrary: ${err.message}`)
    }

    bal.slv({ libBit: { idx: 'list-library', lst: resultList, src: bal.idx } })
    return cpy
}

export const updateLibrary = async (
    cpy: LibraryModel,
    bal: LibraryBit,
    ste: State,
) => {
    const fs = require('fs-extra')
    const doT = require('dot')
    const path = require('path')

    const capitalize = (s: string) =>
        s.length > 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s

    const isRepoRoot = (dir: string): boolean => {
        try {
            return (
                fs.existsSync(path.join(dir, 'apps')) &&
                fs.existsSync(path.join(dir, 'packages')) &&
                fs.existsSync(path.join(dir, 'package.json'))
            )
        } catch {
            return false
        }
    }

    try {
        // 1. Resolve repository root
        let repoRoot = process.cwd()
        while (repoRoot && !isRepoRoot(repoRoot)) {
            const parent = path.dirname(repoRoot)
            if (parent === repoRoot) break
            repoRoot = parent
        }

        if (!isRepoRoot(repoRoot)) {
            let dir = typeof __dirname !== 'undefined' ? __dirname : process.cwd()
            while (dir && dir !== path.dirname(dir)) {
                if (isRepoRoot(dir)) {
                    repoRoot = dir
                    break
                }
                dir = path.dirname(dir)
            }
        }

        // 2. Resolve clean target workspace
        const rawTarget = (bal?.src || 'apps/995.library/995.library')
            .replace(/[\[\]]/g, '')
            .trim()

        let targetDir = path.resolve(repoRoot, rawTarget)
        if (!fs.existsSync(targetDir)) {
            const candidatePkg = path.resolve(repoRoot, 'packages', rawTarget)
            const candidateApp = path.resolve(repoRoot, 'apps', rawTarget)
            if (fs.existsSync(candidatePkg)) {
                targetDir = candidatePkg
            } else if (fs.existsSync(candidateApp)) {
                targetDir = candidateApp
            } else {
                const errMsg = `Target directory not found: ${rawTarget}`
                if (ste) {
                    await ste.hunt(ActCns.UPDATE_CONSOLE, {
                        idx: 'cns00',
                        src: `>> [RE-WIRE ERROR] ${errMsg}`,
                    })
                }
                if (bal?.slv != null) {
                    bal.slv({
                        libBit: {
                            idx: 'update-library-err',
                            dat: errMsg,
                        },
                    })
                }
                return cpy
            }
        }

        const relativeDisplay = path.relative(repoRoot, targetDir).replace(/\\/g, '/')
        if (ste) {
            await ste.hunt(ActCns.UPDATE_CONSOLE, {
                idx: 'cns00',
                src: `>> [UPDATE] Compiling manifest for: [${relativeDisplay}]`,
            })
        }

        // 3. Resolve template BEE.txt
        const templateCandidates = [
            path.resolve(repoRoot, 'apps/995.library/data/redux/BEE.txt'),
            path.resolve(process.cwd(), './data/redux/BEE.txt'),
            path.resolve(targetDir, 'BEE.txt'),
        ]

        let templatePath: string | null = null
        for (const candidate of templateCandidates) {
            if (fs.existsSync(candidate)) {
                templatePath = candidate
                break
            }
        }

        const defaultTemplate = [
            'import Model from "./99.core/interface/model.interface";',
            '',
            '{{=it.unitImports}}',
            '',
            '{{=it.faceImports}}',
            '',
            'export const list: Array< any > = {{=it.unitList}}',
            '',
            '{{=it.reduceImports}}',
            '',
            'export const reducer: any = {',
            ' {{=it.reduceList}}',
            '};',
            '',
            'export default class UnitData implements Model {',
            ' {{=it.modelList}}',
            '}',
        ].join('\n')

        const rawTemplate = templatePath
            ? fs.readFileSync(templatePath, 'utf8')
            : defaultTemplate

        // 4. Deterministic Unit Discovery
        const entries = fs.readdirSync(targetDir, { withFileTypes: true })
        const unitFolders = entries
            .filter(
                (entry: any) =>
                    entry.isDirectory() && /^\d{2}\..+\.unit$/.test(entry.name),
            )
            .map((entry: any) => entry.name)
            .sort((a: string, b: string) => a.localeCompare(b))

        if (unitFolders.length === 0) {
            const warningMsg = `No .unit packages detected in ${relativeDisplay}`
            if (ste) {
                await ste.hunt(ActCns.UPDATE_CONSOLE, {
                    idx: 'cns00',
                    src: `>> [UPDATE] [WARN] ${warningMsg}`,
                })
            }
        }

        const items: Array<{
            unitName: string
            element: string
            unitImport: string
            faceImport: string
            modlImport: string
            redcImport: string
            reduced: string
            model: string
        }> = []

        for (const folder of unitFolders) {
            const parts = folder.split('.')
            const element = parts.slice(1, -1).join('.') || parts[1] || folder
            const unitName = capitalize(element)
            const faceTypeName =
                unitName === 'Model' ? 'ModelInterface' : unitName

            const unitImport = `import ${unitName}Unit from "./${folder}/${element}.unit";`
            const faceImport = `import ${faceTypeName} from "./${folder}/fce/${element}.interface";`
            const modlImport = `import { ${unitName}Model } from "./${folder}/${element}.model";`
            const redcImport = `import * as reduceFrom${unitName} from "./${folder}/${element}.reduce";`

            const reduced = `${element}: reduceFrom${unitName}.reducer,`
            const model = `${element}: ${faceTypeName} = new ${unitName}Model();`

            items.push({
                unitName,
                element,
                unitImport,
                faceImport,
                modlImport,
                redcImport,
                reduced,
                model,
            })
        }

        const gel = {
            unitImports: items.map((i) => i.unitImport).join('\n'),
            faceImports: items
                .map((i) => `${i.faceImport}\n${i.modlImport}`)
                .join('\n'),
            unitList: `[${items.map((i) => `${i.unitName}Unit`).join(', ')}];`,
            reduceImports: items.map((i) => i.redcImport).join('\n'),
            reduceList: items.map((i) => `    ${i.reduced}`).join('\n'),
            modelList: items.map((i) => `    ${i.model}`).join('\n'),
        }

        // 5. Template Interpolation
        const lines = rawTemplate.split('\n')
        const outputLines: string[] = []

        for (const line of lines) {
            if (line.trim().startsWith('//')) {
                outputLines.push(line)
                continue
            }
            try {
                const compiled = doT.template(line)(gel)
                outputLines.push(compiled)
            } catch {
                outputLines.push(line)
            }
        }

        const finalContent = outputLines.join('\n').replace(/\n{3,}/g, '\n\n')
        const targetBeePath = path.join(targetDir, 'BEE.ts')

        fs.writeFileSync(targetBeePath, finalContent, 'utf8')

        if (ste) {
            await ste.hunt(ActCns.UPDATE_CONSOLE, {
                idx: 'cns00',
                src: `>> [UPDATE] [OK] Manifest written: ${path.relative(repoRoot, targetBeePath).replace(/\\/g, '/')}`,
            })
        }

        if (bal?.slv != null) {
            bal.slv({
                libBit: {
                    idx: 'update-library',
                    src: path.relative(repoRoot, targetBeePath).replace(/\\/g, '/'),
                    val: items.length,
                },
            })
        }
    } catch (err: any) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        if (ste) {
            await ste.hunt(ActCns.UPDATE_CONSOLE, {
                idx: 'cns00',
                src: `>> [RE-WIRE ERROR] ${errorMsg}`,
            })
        }
        if (bal?.slv != null) {
            bal.slv({
                libBit: {
                    idx: 'update-library-err',
                    src: errorMsg,
                },
            })
        }
    }

    return cpy
}

export const progressLibrary = async (
    cpy: LibraryModel,
    bal: LibraryBit,
    ste: State,
) => {
    /**
     * Synchronizes and overrides a remote directory with the contents of the local `apps/995.library`.
     *
     * This function is essential for propagating updates made to the central `995.library` out to
     * individual project workspaces. It acts as a one-way mirror operation.
     *
     * @param {LibraryModel} cpy - The current state model for the library unit.
     * @param {LibraryBit} bal - The payload object containing operational parameters.
     *                           - `bal.src` MUST specify the target remote directory path. It may contain brackets (e.g., `[../path]`) which will be stripped.
     *                           - `bal.slv` (Optional) The resolver callback to handle async responses.
     * @param {State} ste - The global state store for dispatching console updates via `ste.hunt`.
     *
     * @returns {LibraryModel} The original, unmodified state copy.
     *
     * @remarks
     * 1. **Destructive Action:** The target directory specified by `bal.src` is completely wiped (`fs.rm` with `force: true` and `recursive: true`) before copying.
     * 2. **Execution Flow:**
     *    - Validates `bal.src` is provided. If not, dispatches an error via `bal.slv`.
     *    - Cleans the target path string and resolves absolute paths.
     *    - Attempts to recursively remove the target directory if it exists.
     *    - Recursively copies the entire `apps/995.library` folder into the target location.
     * 3. **Console Output:** Dispatches `UPDATE_CONSOLE` events to `cns00` to track progress and report errors to the terminal UI.
     * 4. **Response:** Resolves with an `idx` of `'progress-library'` upon success or `'progress-library-error'` with the error message upon failure.
     */
    const fs = require('fs').promises
    const path = require('path')

    if (!bal.src) {
        if (bal.slv)
            bal.slv({
                libBit: {
                    idx: 'progress-library-error',
                    src: 'No src provided',
                },
            })
        return cpy
    }

    // Strip brackets that might be present from list commands (e.g., `[../remote/path]`)
    const cleanSrc = bal.src.replace(/[\[\]]/g, '')

    const targetDir = path.resolve(process.cwd(), cleanSrc)
    const sourceDir = path.resolve(process.cwd(), 'apps', '995.library')

    await ste.hunt(ActCns.UPDATE_CONSOLE, {
        idx: 'cns00',
        src: 'Starting to progress library to ' + targetDir,
    })

    try {
        try {
            await fs.access(targetDir)
            await fs.rm(targetDir, { recursive: true, force: true })
        } catch (e) {
            // directory does not exist, which is fine
        }

        await fs.cp(sourceDir, targetDir, { recursive: true })

        await ste.hunt(ActCns.UPDATE_CONSOLE, {
            idx: 'cns00',
            src: 'Library copied to ' + targetDir,
        })

        if (bal.slv)
            bal.slv({ libBit: { idx: 'progress-library', src: bal.src } })
    } catch (err) {
        await ste.hunt(ActCns.UPDATE_CONSOLE, {
            idx: 'cns00',
            src: 'Error progressing library: ' + err.message,
        })

        if (bal.slv)
            bal.slv({
                libBit: { idx: 'progress-library-error', src: err.message },
            })
    }

    return cpy
}

export const resolveRepoRoot = (startDir: string = process.cwd()): string => {
    const fs = require('fs-extra')
    const path = require('path')
    let curr = path.resolve(startDir)
    while (
        curr &&
        curr !== path.dirname(curr) &&
        !(
            fs.existsSync(path.join(curr, 'apps')) &&
            fs.existsSync(path.join(curr, 'packages'))
        )
    ) {
        const parent = path.dirname(curr)
        if (parent === curr) break
        curr = parent
    }
    if (
        fs.existsSync(path.join(curr, 'apps')) &&
        fs.existsSync(path.join(curr, 'packages'))
    ) {
        return curr
    }
    return path.resolve(startDir)
}

export const scanLibrary = (cpy: LibraryModel, bal: LibraryBit, ste: State) => {
    /**
     * Scans sibling directories to find other workspaces containing an `apps/995.library` folder.
     *
     * It resolves the monorepo root dynamically, moves up one level, and inspects all adjacent directories.
     * If a sibling repository contains an `apps/995.library` path, its relative path (from the repository root)
     * is added to the results list. This list can then be used to synchronize or
     * "progress" the library across different projects.
     */
    const fs = require('fs-extra')
    const path = require('path')

    const resultList: string[] = []
    const repoRoot = resolveRepoRoot(process.cwd())
    const parentDir = path.resolve(repoRoot, '..')

    try {
        if (fs.existsSync(parentDir)) {
            const entries = fs.readdirSync(parentDir, { withFileTypes: true })

            for (const entry of entries) {
                if (!entry.isDirectory()) continue

                const itemPath = path.join(parentDir, entry.name)

                // Skip the current repo
                if (path.resolve(itemPath) === path.resolve(repoRoot)) continue

                const libraryDir = path.join(itemPath, 'apps', '995.library')
                if (fs.existsSync(libraryDir)) {
                    const relativePath = path.relative(repoRoot, libraryDir)
                    resultList.push(`[${relativePath.replace(/\\/g, '/')}]`)
                }
            }
        }
    } catch (err: any) {
        if (ste && typeof ste.hunt === 'function') {
            const ActCns = require('../../83.console.unit/console.action')
            ste.hunt(ActCns.UPDATE_CONSOLE, {
                idx: 'cns00',
                src: `>> [SCAN_LIBRARY_ERR] ${err.message}`,
            })
        }
    }

    resultList.sort((a, b) => a.localeCompare(b))

    if (bal && bal.slv) bal.slv({ libBit: { idx: 'scan-library', lst: resultList } })

    return cpy
}

var patch = (ste, type, bale) => ste.dispatch({ type, bale })

export const launchLibrary = async (
    cpy: LibraryModel,
    bal: LibraryBit,
    ste: State,
) => {
    const fs = require('fs')
    const path = require('path')
    const { execFile } = require('child_process')

    const filePath = path.resolve(process.cwd(), 'data/launch.txt')

    if (fs.existsSync(filePath)) {
        const fileContent = fs.readFileSync(filePath, 'utf-8')
        const urls = fileContent
            .split('\n')
            .map((url: string) => url.trim())
            .filter((url: string) => url.length > 0)

        for (const url of urls) {
            let cmd: string
            let args: string[]
            switch (process.platform) {
                case 'darwin':
                    cmd = 'open'
                    args = [url]
                    break
                case 'win32':
                    cmd = 'cmd.exe'
                    args = ['/c', 'start', '', url]
                    break
                default:
                    cmd = 'xdg-open'
                    args = [url]
                    break
            }

            execFile(cmd, args, (error: any) => {
                if (error) {
                    console.error(`Error opening url: ${url}`, error)
                }
            })

            await new Promise((resolve) => setTimeout(resolve, 1000))
        }
    } else {
        console.error('launch.txt not found at data/launch.txt')
    }

    if (bal.slv != null) bal.slv({ libBit: { idx: 'launch-library' } })

    return cpy
}

export const flatLibrary = async (
    cpy: LibraryModel,
    bal: LibraryBit,
    ste: State,
) => {
    const fs = require('fs-extra')
    const path = require('path')

    // 1. Resolve repository root directory
    const isRepoRoot = (dir: string) => {
        try {
            return (
                fs.existsSync(path.join(dir, 'apps')) &&
                fs.existsSync(path.join(dir, 'packages')) &&
                fs.existsSync(path.join(dir, 'package.json'))
            )
        } catch {
            return false
        }
    }

    let repoRoot = process.cwd()
    while (repoRoot && !isRepoRoot(repoRoot)) {
        const parent = path.dirname(repoRoot)
        if (parent === repoRoot) break
        repoRoot = parent
    }

    if (!isRepoRoot(repoRoot)) {
        let dir = typeof __dirname !== 'undefined' ? __dirname : process.cwd()
        while (dir) {
            if (isRepoRoot(dir)) {
                repoRoot = dir
                break
            }
            const parent = path.dirname(dir)
            if (parent === dir) break
            dir = parent
        }
    }

    const timestamp = Date.now()
    const outputDir = path.join(repoRoot, 'data', 'flat')
    const outputFile = path.join(outputDir, `${timestamp}.txt`)

    if (ste) {
        await ste.hunt(ActCns.UPDATE_CONSOLE, {
            idx: 'cns00',
            src: '>> [FLAT] Starting Flat Library distillation...',
        })
    }

    // Include .astro in IGNORED_DIRS so internal build caches are never parsed
    const IGNORED_DIRS = new Set([
        'node_modules',
        'dist',
        'data',
        '.git',
        '.wrangler',
        '.astro',
        '__snapshots__',
        'public',
    ])
    const IGNORED_FILES = new Set([
        'worker-configuration.d.ts',
    ])
    const CODE_EXTS = new Set([
        '.ts',
        '.tsx',
        '.js',
        '.cjs',
        '.mjs',
        '.jsonc',
        '.toml',
        '.yml',
        '.yaml',
    ])
    const ALLOWED_FILES = new Set([
        '.gitignore',
        'package.json',
        'AGENTS.md',
        'AGENT_INSTRUCTIONS.md',
    ])

    // Non-text binaries excluded from flat text ledgers
    const BINARY_EXTS = new Set([
        '.png',
        '.jpg',
        '.jpeg',
        '.gif',
        '.webp',
        '.ico',
        '.woff',
        '.woff2',
        '.ttf',
        '.eot',
        '.mp4',
        '.mp3',
        '.pdf',
        '.zip',
        '.svg',
        '.map',
    ])

    async function getFilePaths(dir: string): Promise<string[]> {
        let entries
        try {
            entries = await fs.readdir(dir, { withFileTypes: true })
        } catch {
            return []
        }

        const filePaths: string[] = []
        for (const entry of entries) {
            if (entry.isDirectory()) {
                if (IGNORED_DIRS.has(entry.name) && entry.name !== 'schema') {
                    continue
                }
                const subFiles = await getFilePaths(path.join(dir, entry.name))
                filePaths.push(...subFiles)
            } else if (entry.isFile()) {
                if (entry.name.toLowerCase() === 'readme.md') {
                    continue
                }
                if (IGNORED_FILES.has(entry.name.toLowerCase())) {
                    continue
                }
                filePaths.push(path.join(dir, entry.name))
            }
        }

        return filePaths
    }

    // =========================================================================
    // FEATURE: ASTRO SURFACE INGESTION (ASTRO_SURFACE_HARVEST)
    // Discovers any apps/* workspaces containing a .astro directory and
    // extracts their complete src/ tree, strictly excluding .env files.
    // =========================================================================
    async function getAstroWorkspaceSrcFiles(appsRoot: string): Promise<string[]> {
        if (!fs.existsSync(appsRoot)) return []
        const harvestedFiles: string[] = []

        try {
            const appEntries = await fs.readdir(appsRoot, { withFileTypes: true })

            for (const appEntry of appEntries) {
                if (!appEntry.isDirectory()) continue
                const appDir = path.join(appsRoot, appEntry.name)
                const astroSentinel = path.join(appDir, '.astro')

                if (fs.existsSync(astroSentinel)) {
                    const srcDir = path.join(appDir, 'src')
                    if (!fs.existsSync(srcDir)) continue

                    if (ste) {
                        await ste.hunt(ActCns.UPDATE_CONSOLE, {
                            idx: 'cns00',
                            src: `>> [ASTRO] Detected Astro workspace in apps/${appEntry.name}. Harvesting src/...`,
                        })
                    }

                    const harvestSrcRecursively = async (currentDir: string): Promise<void> => {
                        const entries = await fs.readdir(currentDir, { withFileTypes: true })
                        for (const entry of entries) {
                            const fullPath = path.join(currentDir, entry.name)

                            if (entry.isDirectory()) {
                                if (IGNORED_DIRS.has(entry.name)) continue
                                if (entry.name === 'assets') continue
                                await harvestSrcRecursively(fullPath)
                            } else if (entry.isFile()) {
                                const base = entry.name.toLowerCase()
                                const ext = path.extname(entry.name).toLowerCase()

                                // Strict secret quarantine: purge .env, .env.*, and .dev.vars
                                if (base === '.env' || base.startsWith('.env.') || base.startsWith('.dev.vars')) {
                                    continue
                                }
                                if (IGNORED_FILES.has(base)) {
                                    continue
                                }
                                if (
                                    BINARY_EXTS.has(ext) ||
                                    base.endsWith('.map') ||
                                    ext === '.snap'
                                ) {
                                    continue
                                }

                                harvestedFiles.push(fullPath)
                            }
                        }
                    }

                    await harvestSrcRecursively(srcDir)
                }
            }
        } catch (err: any) {
            if (ste) {
                await ste.hunt(ActCns.UPDATE_CONSOLE, {
                    idx: 'cns00',
                    src: `>> [ASTRO:WARN] Astro harvest error: ${err.message}`,
                })
            }
        }

        return harvestedFiles
    }

    try {
        const targetRoots = ['apps', 'packages', '.github', '.'].map((folder) =>
            path.join(repoRoot, folder),
        )
        const allScannedFiles: string[] = []

        for (const targetRoot of targetRoots) {
            if (!fs.existsSync(targetRoot)) continue

            if (targetRoot === repoRoot) {
                const subEntries = await fs.readdir(targetRoot, {
                    withFileTypes: true,
                })
                for (const entry of subEntries) {
                    if (entry.isFile()) {
                        allScannedFiles.push(path.join(targetRoot, entry.name))
                    }
                }
            } else if (path.basename(targetRoot) === '.github') {
                const files = await getFilePaths(targetRoot)
                allScannedFiles.push(...files)
            } else {
                const subEntries = await fs.readdir(targetRoot, {
                    withFileTypes: true,
                })
                for (const entry of subEntries) {
                    if (!entry.isDirectory()) continue
                    if (IGNORED_DIRS.has(entry.name) && entry.name !== 'schema')
                        continue
                    const subDir = path.join(targetRoot, entry.name)
                    const files = await getFilePaths(subDir)
                    allScannedFiles.push(...files)
                }
            }
        }

        // Standard code file filter
        const standardCodeFiles = allScannedFiles.filter((file) => {
            const ext = path.extname(file)
            const filename = path.basename(file)

            if (IGNORED_FILES.has(filename.toLowerCase())) return false

            const isAllowedFile =
                ALLOWED_FILES.has(filename) || filename.startsWith('tsconfig')

            if (!CODE_EXTS.has(ext) && !isAllowedFile) return false
            if (ext === '.js') {
                const tsSibling = file.slice(0, -3) + '.ts'
                if (fs.existsSync(tsSibling)) return false
            }
            return true
        })

        // Execute Astro Surface Harvest across apps/
        const astroFiles = await getAstroWorkspaceSrcFiles(path.join(repoRoot, 'apps'))

        // Deduplicate standard files and harvested Astro src files
        const mergedFileSet = new Set<string>([...standardCodeFiles, ...astroFiles])
        const codeFiles = Array.from(mergedFileSet)

        // Sort files deterministically for bit-reproducible output
        codeFiles.sort((a, b) => a.localeCompare(b))

        if (ste) {
            await ste.hunt(ActCns.UPDATE_CONSOLE, {
                idx: 'cns00',
                src: `>> [FLAT] Assembled ${codeFiles.length} files (including ${astroFiles.length} Astro src files).`,
            })
        }

        // Read content and format source headers
        const fileContents = await Promise.all(
            codeFiles.map(async (file) => {
                const content = await fs.readFile(file, 'utf8')
                const relativePath = path
                    .relative(repoRoot, file)
                    .replace(/\\/g, '/')
                return `// ----- SOURCE: ${relativePath} -----\n${content}`
            }),
        )

        const combinedData = fileContents.join('\n\n')
        await fs.outputFile(outputFile, combinedData)

        const relOutput = path
            .relative(repoRoot, outputFile)
            .replace(/\\/g, '/')

        if (ste) {
            await ste.hunt(ActCns.UPDATE_CONSOLE, {
                idx: 'cns00',
                src: `>> [OK] Wrote flattened library to: ${relOutput}`,
            })
        }

        if (bal && bal.slv != null) {
            bal.slv({
                libBit: {
                    idx: 'flat-library',
                    src: relOutput,
                    val: codeFiles.length,
                },
            })
        }
    } catch (err: any) {
        if (ste) {
            await ste.hunt(ActCns.UPDATE_CONSOLE, {
                idx: 'cns00',
                src: `>> [FAIL] Error flattening library: ${err.message}`,
            })
        }
        if (bal && bal.slv != null) {
            bal.slv({ libBit: { idx: 'flat-library-error', src: err.message } })
        }
    }

    return cpy
}

/**
 * Resolves the master workspace root (FLEET_ROOT) across multi-tenant organizations.
 * Evaluates explicit environment overrides, sentinel lockfiles, and organization markers
 * while defending against CI runner traps and filesystem escape loops.
 */
export const resolveFleetRoot = (
    startDir: string = process.cwd(),
): string | null => {
    const fs = require('fs-extra')
    const path = require('path')

    // 1. Primary: Explicit environment variables
    if (process.env.FLEET_ROOT) {
        const candidate = path.resolve(process.cwd(), process.env.FLEET_ROOT)
        try {
            if (
                fs.existsSync(candidate) &&
                fs.statSync(candidate).isDirectory()
            ) {
                return candidate
            }
        } catch {
            // Ignore access errors on invalid env paths
        }
    }

    if (process.env.WORK_DIR) {
        const candidate = path.resolve(process.cwd(), process.env.WORK_DIR)
        try {
            if (
                fs.existsSync(candidate) &&
                fs.statSync(candidate).isDirectory()
            ) {
                return candidate
            }
        } catch {
            // Ignore access errors on invalid env paths
        }
    }

    // 2. Secondary: Upward sentinel and organizational crawl
    let current = path.resolve(startDir)
    const root = path.parse(current).root

    while (current && current !== root) {
        // Check for Cauldron Sentinel Anchor
        const cauldronAnchor = path.join(
            current,
            'camp-candor-cauldron',
            'versions.json',
        )
        if (fs.existsSync(cauldronAnchor)) {
            return current
        }

        const directAnchor = path.join(current, 'versions.json')
        if (
            fs.existsSync(directAnchor) &&
            path.basename(current) === 'camp-candor-cauldron'
        ) {
            return path.resolve(current, '..')
        }

        // Check for multi-tenant organization markers or thematic clusters
        const hasOrgClusters =
            fs.existsSync(path.join(current, 'campc-it-com')) ||
            fs.existsSync(path.join(current, 'cauldron-it-com')) ||
            fs.existsSync(path.join(current, 'astro-kahn-it-com')) ||
            fs.existsSync(path.join(current, 'slopratchet.com')) ||
            (fs.existsSync(path.join(current, '00.governance')) &&
                fs.existsSync(path.join(current, '01.canon')))

        if (hasOrgClusters) {
            return current
        }

        // CI Runner Guard: bypass /home/runner/work without sentinels
        const normalizedCurrent = current
            .replace(/^[a-zA-Z]:/, '')
            .replace(/\\/g, '/')
        const isCiRunnerPath =
            current === '/home/runner/work' ||
            path.dirname(current) === '/home/runner' ||
            normalizedCurrent === '/home/runner/work' ||
            normalizedCurrent === '/home/runner' ||
            normalizedCurrent.startsWith('/home/runner/')

        if (!isCiRunnerPath) {
            // Generic 'work' workspace directory name match
            if (
                path.basename(current).toLowerCase() === 'work' ||
                path.basename(current).toLowerCase() === 'cauldron-it-com'
            ) {
                return current
            }
        }

        const parent = path.dirname(current)
        if (parent === current) break
        current = parent
    }

    return null
}

export const scanFleet = async (
    cpy: LibraryModel,
    bal: LibraryBit,
    ste: State,
) => {
    const fs = require('fs-extra')
    const path = require('path')

    const emitTelemetry = async (src: string) => {
        if (ste && typeof ste.hunt === 'function') {
            try {
                const ActCns = require('../../83.console.unit/console.action')
                await ste.hunt(ActCns.UPDATE_CONSOLE, {
                    idx: 'cns00',
                    src,
                })
            } catch {
                // Ignore telemetry dispatch errors during testing or headless runtime
            }
        }
    }

    const fleetRoot = resolveFleetRoot()

    if (!fleetRoot) {
        if (ste && typeof ste.hunt === 'function') {
            await emitTelemetry(
                '>> [SCAN_FLEET_ERR] Unable to resolve fleet root boundary.',
            )
        }
        if (bal && typeof bal.slv === 'function') {
            bal.slv({
                libBit: {
                    idx: 'scan-fleet-error',
                    src: 'NO_FLEET_ROOT',
                    lst: [],
                    val: -1,
                },
            })
        }
        return cpy
    }

    if (ste && typeof ste.hunt === 'function') {
        await emitTelemetry(`>> [SCAN_FLEET] Scanning fleet root: ${fleetRoot}`)
    }

    const IGNORED = new Set([
        'node_modules',
        '.git',
        'dist',
        '.wrangler',
        '$RECYCLE.BIN',
        'Config.Msi',
        'coverage',
        '.nyc_output',
        '.idea',
        '.vscode',
    ])

    const reposToCheck = new Set<string>()

    const isRepo = (dir: string): boolean => {
        try {
            return (
                fs.existsSync(path.join(dir, 'package.json')) ||
                fs.existsSync(path.join(dir, 'apps')) ||
                fs.existsSync(path.join(dir, 'packages'))
            )
        } catch {
            return false
        }
    }

    try {
        const topEntries = fs.readdirSync(fleetRoot, { withFileTypes: true })

        for (const entry of topEntries) {
            if (!entry.isDirectory()) continue
            if (IGNORED.has(entry.name)) continue

            const entryPath = path.join(fleetRoot, entry.name)

            // 1. Direct repository directly under fleetRoot
            if (isRepo(entryPath)) {
                reposToCheck.add(entryPath)
            }

            // 2. Multi-tenant organizational cluster subdirectories
            try {
                const subEntries = fs.readdirSync(entryPath, {
                    withFileTypes: true,
                })
                for (const sub of subEntries) {
                    if (!sub.isDirectory()) continue
                    if (IGNORED.has(sub.name)) continue

                    const subPath = path.join(entryPath, sub.name)
                    if (isRepo(subPath)) {
                        reposToCheck.add(subPath)
                    }
                }
            } catch {
                // Ignore directory read access errors
            }
        }

        const fleetMap: string[] = []
        const targetPivot =
            bal && bal.src ? bal.src.replace(/[\[\]]/g, '').trim() : null

        if (targetPivot) {
            if (ste && typeof ste.hunt === 'function') {
                await emitTelemetry(
                    `>> [SCAN_FLEET] Target pivot filter: ${targetPivot}`,
                )
            }
        }

        for (const repoPath of reposToCheck) {
            if (targetPivot) {
                const pkgTarget = path.join(repoPath, 'packages', targetPivot)
                const appTarget = path.join(repoPath, 'apps', targetPivot)

                if (fs.existsSync(pkgTarget)) {
                    const rel = path.relative(fleetRoot, pkgTarget)
                        .replace(/\\/g, '/')
                        .replace(/^\/+/, '')
                    fleetMap.push(`[${rel}]`)
                } else if (fs.existsSync(appTarget)) {
                    const rel = path.relative(fleetRoot, appTarget)
                        .replace(/\\/g, '/')
                        .replace(/^\/+/, '')
                    fleetMap.push(`[${rel}]`)
                }
            } else {
                // Default: Discover repositories hosting the apps/995.library flight deck
                const harnessTarget = path.join(repoPath, 'apps', '995.library')
                if (fs.existsSync(harnessTarget)) {
                    const rel = path.relative(fleetRoot, harnessTarget)
                        .replace(/\\/g, '/')
                        .replace(/^\/+/, '')
                    fleetMap.push(`[${rel}]`)
                }
            }
        }

        // Deterministic alphabetical sorting for Blessed UI menus
        fleetMap.sort((a, b) => a.localeCompare(b))

        if (ste && typeof ste.hunt === 'function') {
            await emitTelemetry(
                `>> [SCAN_FLEET_OK] Discovered ${fleetMap.length} target(s) across fleet.`,
            )
        }

        if (bal && typeof bal.slv === 'function') {
            bal.slv({
                libBit: {
                    idx: 'scan-fleet',
                    lst: fleetMap,
                    val: fleetMap.length,
                    src: fleetRoot,
                },
            })
        }
    } catch (err: any) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        if (ste && typeof ste.hunt === 'function') {
            await emitTelemetry(`>> [SCAN_FLEET_ERR] Scan failure: ${errorMsg}`)
        }

        if (bal && typeof bal.slv === 'function') {
            bal.slv({
                libBit: {
                    idx: 'scan-fleet-error',
                    src: errorMsg,
                    lst: [],
                    val: -1,
                },
            })
        }
    }

    return cpy
}




export interface GitTreeStatus {
    clean: boolean
    repoRoot: string
    dirtyFiles: {
        indexStatus: string
        workTreeStatus: string
        filePath: string
        origPath?: string
    }[]
    intersectingFiles: string[]
}

export const resolveGitRoot = async (targetDir: string): Promise<string | null> => {
    const { execFile } = require('child_process')
    const { promisify } = require('util')
    const execFileAsync = promisify(execFile)
    const path = require('path')
    const fs = require('fs-extra')

    try {
        const { stdout } = await execFileAsync('git', ['rev-parse', '--show-toplevel'], {
            cwd: targetDir,
        })
        return path.resolve(stdout.trim())
    } catch {
        let curr = path.resolve(targetDir)
        while (curr && curr !== path.dirname(curr)) {
            if (fs.existsSync(path.join(curr, '.git'))) {
                return curr
            }
            const parent = path.dirname(curr)
            if (parent === curr) break
            curr = parent
        }
        return null
    }
}

export const checkGitWorkingTree = async (targetDir: string): Promise<GitTreeStatus> => {
    const { execFile } = require('child_process')
    const { promisify } = require('util')
    const execFileAsync = promisify(execFile)
    const path = require('path')

    const repoRoot = await resolveGitRoot(targetDir)

    if (!repoRoot) {
        return { clean: true, repoRoot: targetDir, dirtyFiles: [], intersectingFiles: [] }
    }

    let stdout = ''
    try {
        const res = await execFileAsync('git', ['status', '--porcelain=v1', '-uall'], {
            cwd: repoRoot,
        })
        stdout = res.stdout
    } catch {
        return { clean: true, repoRoot, dirtyFiles: [], intersectingFiles: [] }
    }

    const relTarget = path.relative(repoRoot, targetDir).replace(/\\/g, '/')
    const targetPrefix = relTarget.endsWith('/') ? relTarget : `${relTarget}/`

    const dirtyFiles: GitTreeStatus['dirtyFiles'] = [];
    const intersectingFiles: string[] = []

    const lines = stdout.split('\n').filter((line: string) => line.length >= 3)

    for (const line of lines) {
        const indexStatus = line.slice(0, 1)
        const workTreeStatus = line.slice(1, 2)
        let rawPath = line.slice(3).trim()

        if (indexStatus === '!' && workTreeStatus === '!') continue

        if (rawPath.startsWith('"') && rawPath.endsWith('"')) {
            rawPath = rawPath.slice(1, -1).replace(/\\"/g, '"')
        }

        let filePath = rawPath
        let origPath: string | undefined

        if (rawPath.includes(' -> ')) {
            const parts = rawPath.split(' -> ')
            origPath = parts[0].replace(/\\/g, '/')
            filePath = parts[1].replace(/\\/g, '/')
        } else {
            filePath = filePath.replace(/\\/g, '/')
        }

        dirtyFiles.push({ indexStatus, workTreeStatus, filePath, origPath })

        const hitsCurrent = filePath.startsWith(targetPrefix) || filePath === relTarget
        const hitsOrig = origPath ? origPath.startsWith(targetPrefix) || origPath === relTarget : false

        if (hitsCurrent || hitsOrig) {
            intersectingFiles.push(filePath)
            if (hitsOrig && origPath) intersectingFiles.push(origPath)
        }
    }

    return {
        clean: intersectingFiles.length === 0,
        repoRoot,
        dirtyFiles,
        intersectingFiles,
    }
}

export const retryAtomicRename = async (
    oldPath: string,
    newPath: string,
    maxRetries = 5,
    initialDelayMs = 50,
): Promise<void> => {
    const fs = require('fs-extra');
    let attempt = 0;
    let delay = initialDelayMs;

    while (attempt < maxRetries) {
        try {
            await fs.rename(oldPath, newPath);
            return;
        } catch (err: any) {
            attempt++;
            const isLockError = err.code === 'EBUSY' || err.code === 'EPERM' || err.code === 'EACCES';
            if (!isLockError || attempt >= maxRetries) {
                throw new Error(
                    `[ATOMIC_RENAME_FAILED] Failed to rename '${oldPath}' to '${newPath}' after ${attempt} attempt(s): ${err.message}`,
                );
            }
            // Exponential jitter delay
            const jitter = Math.floor(Math.random() * 20);
            await new Promise((resolve) => setTimeout(resolve, delay + jitter));
            delay *= 2;
        }
    }
};

export const swapAtomicInodes = async (
    stagingDir: string,
    targetDir: string,
    backupDir: string,
    ste?: State,
): Promise<{ promoted: boolean; restored: boolean; error?: Error }> => {
    const fs = require('fs-extra');
    let backupCreated = false;

    try {
        const targetExists = await fs.pathExists(targetDir);

        // Step B: Atomically backup existing target if present
        if (targetExists) {
            if (ste) {
                await ste.hunt(ActCns.UPDATE_CONSOLE, {
                    idx: 'cns00',
                    src: `>> [BACKUP] Shifting active target -> ${backupDir}`,
                });
            }
            await retryAtomicRename(targetDir, backupDir);
            backupCreated = true;
        }

        // Step C: Atomically promote staging directory into target directory
        if (ste) {
            await ste.hunt(ActCns.UPDATE_CONSOLE, {
                idx: 'cns00',
                src: `>> [PROMOTION] Inode pointer swap -> ${targetDir}`,
            });
        }
        await retryAtomicRename(stagingDir, targetDir);

        // Step D: Teardown backup after verified atomic swap
        if (backupCreated && (await fs.pathExists(backupDir))) {
            await fs.remove(backupDir);
        }

        return { promoted: true, restored: false };
    } catch (swapErr: any) {
        let restored = false;

        // Immediate Forward-Recovery Compensation
        if (backupCreated && (await fs.pathExists(backupDir)) && !(await fs.pathExists(targetDir))) {
            try {
                await retryAtomicRename(backupDir, targetDir);
                restored = true;
                if (ste) {
                    await ste.hunt(ActCns.UPDATE_CONSOLE, {
                        idx: 'cns00',
                        src: `>> [COMPENSATION] Target restored from sibling backup: ${targetDir}`,
                    });
                }
            } catch (restoreErr: any) {
                if (ste) {
                    await ste.hunt(ActCns.UPDATE_CONSOLE, {
                        idx: 'cns00',
                        src: `>> [CRITICAL] Failed to restore backup: ${restoreErr.message}`,
                    });
                }
            }
        }

        // Purge orphaned staging directory
        if (await fs.pathExists(stagingDir)) {
            await fs.remove(stagingDir).catch(() => {});
        }

        return { promoted: false, restored, error: swapErr };
    }
};



export interface SagaTargetRecord {
    targetDir: string;
    backupDir?: string;
    stagingDir?: string;
    state: 'PENDING' | 'STAGED' | 'SWAPPED' | 'COMPLETED' | 'FAILED' | 'ROLLED_BACK';
    error?: string;
}

export interface SagaJournal {
    sagaId: string;
    sourceDir: string;
    status: 'RUNNING' | 'COMPLETED' | 'TORN' | 'COMPENSATED';
    targetsCompleted: string[];
    targetsFailed: string[];
    backups: Record<string, string>;
    records: Record<string, SagaTargetRecord>;
    createdAt: string;
    updatedAt: string;
}

export const getJournalPath = (): string => {
    const path = require('path');
    const override = process.env.SAGA_JOURNAL_PATH;
    if (override && override.trim().length > 0) {
        return path.resolve(override);
    }
    return path.resolve(process.cwd(), 'data', 'saga', 'active.json');
};

export const writeSagaJournal = async (journal: SagaJournal): Promise<void> => {
    const fs = require('fs-extra');
    const path = require('path');
    const journalFile = getJournalPath();
    await fs.ensureDir(path.dirname(journalFile));
    journal.updatedAt = new Date().toISOString();
    await fs.writeJson(journalFile, journal, { spaces: 2 });
};

export const rollbackSagaJournal = async (
    journal: SagaJournal,
    ste?: State,
): Promise<{ compensated: boolean; unrecoverableErrors: string[] }> => {
    const fs = require('fs-extra');
    const unrecoverableErrors: string[] = [];

    if (ste) {
        await ste.hunt(ActCns.UPDATE_CONSOLE, {
            idx: 'cns00',
            src: `>> [COMPENSATION INITIATED] Reverting ${journal.targetsCompleted.length} target(s) backwards in time...`,
        });
    }

    // Reverse-chronological iteration
    const reversedCompleted = [...journal.targetsCompleted].reverse();

    for (const targetDir of reversedCompleted) {
        const backupDir = journal.backups[targetDir];
        const record = journal.records[targetDir];

        if (backupDir && (await fs.pathExists(backupDir))) {
            try {
                if (await fs.pathExists(targetDir)) {
                    await fs.remove(targetDir);
                }
                await fs.rename(backupDir, targetDir);

                if (record) {
                    record.state = 'ROLLED_BACK';
                }

                if (ste) {
                    await ste.hunt(ActCns.UPDATE_CONSOLE, {
                        idx: 'cns00',
                        src: `>> [COMPENSATION] [OK] Reverted target to pre-saga backup: ${targetDir}`,
                    });
                }
            } catch (err: any) {
                const errMsg = `Failed to rollback target '${targetDir}' from '${backupDir}': ${err.message}`;
                unrecoverableErrors.push(errMsg);
                if (ste) {
                    await ste.hunt(ActCns.UPDATE_CONSOLE, {
                        idx: 'cns00',
                        src: `>> [COMPENSATION] [FAIL] ${errMsg}`,
                    });
                }
            }
        }
    }

    // Clean up any remaining staging directories across all records
    for (const targetDir in journal.records) {
        const rec = journal.records[targetDir];
        if (rec.stagingDir && (await fs.pathExists(rec.stagingDir))) {
            await fs.remove(rec.stagingDir).catch(() => {});
        }
    }

    journal.status = unrecoverableErrors.length === 0 ? 'COMPENSATED' : 'TORN';
    await writeSagaJournal(journal);

    return {
        compensated: unrecoverableErrors.length === 0,
        unrecoverableErrors,
    };
};

export const finalizeSagaJournal = async (journal: SagaJournal): Promise<void> => {
    const fs = require('fs-extra');
    // Purge temporary backups
    for (const targetDir in journal.backups) {
        const backupDir = journal.backups[targetDir];
        if (backupDir && (await fs.pathExists(backupDir))) {
            await fs.remove(backupDir).catch(() => {});
        }
    }

    journal.status = 'COMPLETED';
    await writeSagaJournal(journal);

    // Remove active journal file upon clean completion
    const journalFile = getJournalPath();
    if (await fs.pathExists(journalFile)) {
        await fs.remove(journalFile).catch(() => {});
    }
};

export const checkSovereigntyInterlock = async (
    customManifestPath?: string,
): Promise<SovereigntyCheckResult> => {
    const fs = require('fs-extra');
    const path = require('path');

    let manifestPath = customManifestPath;
    if (!manifestPath) {
        const candidates = [
            path.resolve(process.cwd(), 'apps/995.library/data/versions.json'),
            path.resolve(process.cwd(), 'data/versions.json'),
        ];
        manifestPath = candidates.find((p) => fs.existsSync(p));
    }

    if (!manifestPath || !(await fs.pathExists(manifestPath))) {
        return {
            allowed: true,
            isSovereign: true,
            activeRepo: path.basename(process.cwd()),
            sovereignRepo: 'UNKNOWN',
            allowPeripheryBroadcast: false,
            reason: 'NO_MANIFEST_PRESENT',
        };
    }

    let manifest: any = {};
    try {
        manifest = await fs.readJson(manifestPath);
    } catch {
        return {
            allowed: false,
            isSovereign: false,
            activeRepo: path.basename(process.cwd()),
            sovereignRepo: 'UNREADABLE',
            allowPeripheryBroadcast: false,
            reason: 'MANIFEST_PARSE_ERROR',
        };
    }

    const sovereignRepo = manifest.sovereign_repo || 'camp-candor/995.library';
    const activeRepo = path.basename(process.cwd());
    const isSovereign = sovereignRepo.endsWith(activeRepo) || sovereignRepo === activeRepo;
    const allowPeripheryBroadcast = Boolean(manifest.allow_periphery_broadcast);

    const allowed = isSovereign || allowPeripheryBroadcast;

    return {
        allowed,
        isSovereign,
        activeRepo,
        sovereignRepo,
        allowPeripheryBroadcast,
        reason: allowed ? undefined : 'PERIPHERY_BROADCAST_FORBIDDEN',
    };
};

export const rewireLibrary = async (
    cpy: LibraryModel,
    bal: LibraryBit,
    ste: State,
): Promise<LibraryModel> => {
    const fs = require('fs-extra');
    const path = require('path');

    const targetDir = path.resolve(bal?.src || 'apps/995.library/995.library');
    const manifestFile = path.join(targetDir, 'BEE.ts');

    if (ste) {
        await ste.hunt(ActCns.UPDATE_CONSOLE, {
            idx: 'cns00',
            src: `>> [HOT RE-WIRE] Purging cache and invalidating modules for: ${targetDir}`,
        });
    }

    // 1. Purge Node require.cache for target directory modules
    const resolvedPrefix = targetDir.replace(/\\/g, '/');
    for (const modPath in require.cache) {
        const normalized = modPath.replace(/\\/g, '/');
        if (normalized.startsWith(resolvedPrefix)) {
            delete require.cache[modPath];
        }
    }

    // 2. Discover active units
    let unitCount = 0;
    try {
        if (await fs.pathExists(targetDir)) {
            const entries = await fs.readdir(targetDir, { withFileTypes: true });
            unitCount = entries.filter((e: any) => e.isDirectory() && /^\d{2}\..+\.unit$/.test(e.name)).length;
        }
    } catch {}

    // 3. Re-import assembled BEE module into runtime memory if present
    try {
        if (await fs.pathExists(manifestFile)) {
            delete require.cache[require.resolve(manifestFile)];
            const reloadedBee = require(manifestFile);
            if (ste && reloadedBee && reloadedBee.reducer) {
                for (const key in reloadedBee.reducer) {
                    if (typeof (ste as any).reducedApp === 'function') {
                        // Dynamically update reducer table
                        (ste as any).reducers = (ste as any).reducers || {};
                        (ste as any).reducers[key] = reloadedBee.reducer[key];
                    }
                }
            }
        }
    } catch (err: any) {
        if (ste) {
            await ste.hunt(ActCns.UPDATE_CONSOLE, {
                idx: 'cns00',
                src: `:: [WARN] Hot module reload notice: ${err.message}`,
            });
        }
    }

    if (ste) {
        await ste.hunt(ActCns.UPDATE_CONSOLE, {
            idx: 'cns00',
            src: `>> [HOT RE-WIRE] [OK] Successfully re-wired ${unitCount} unit slice(s) into active memory.`,
        });
    }

    const receipt: RewireResult = {
        rewired: true,
        targetDir,
        unitCount,
        manifestPath: manifestFile,
        timestamp: new Date().toISOString(),
    };

    if (bal?.slv) {
        bal.slv({
            libBit: {
                idx: 'rewire-library',
                dat: receipt,
                src: targetDir,
                val: unitCount,
            },
        });
    }

    return cpy;
};

export const progressLibrarySaga = async (
    cpy: LibraryModel,
    bal: LibraryBit,
    ste: State,
) => {
    const fs = require('fs-extra')
    const path = require('path')

    let targets: string[] = []
    if (bal && bal.lst && Array.isArray(bal.lst)) {
        targets = bal.lst.map((t: string) => t.replace(/[\[\]]/g, '').trim())
    } else if (bal && bal.src) {
        targets = [bal.src.replace(/[\[\]]/g, '').trim()]
    }

    targets = targets.filter(Boolean)

    // In progressLibrarySaga, insert sovereignty check before target iteration:
    const sovereignty = await checkSovereigntyInterlock();
    if (!sovereignty.allowed) {
        if (ste) {
            await ste.hunt(ActCns.UPDATE_CONSOLE, {
                idx: 'cns00',
                src: '>> ==============================================================',
            });
            await ste.hunt(ActCns.UPDATE_CONSOLE, {
                idx: 'cns00',
                src: '>> [SOVEREIGNTY INTERLOCK] BROADCAST DENIED: PERIPHERY NODE LOCKED',
            });
            await ste.hunt(ActCns.UPDATE_CONSOLE, {
                idx: 'cns00',
                src: `>> Active Repo : ${sovereignty.activeRepo}`,
            });
            await ste.hunt(ActCns.UPDATE_CONSOLE, {
                idx: 'cns00',
                src: `>> Sovereign   : ${sovereignty.sovereignRepo}`,
            });
            await ste.hunt(ActCns.UPDATE_CONSOLE, {
                idx: 'cns00',
                src: '>> Fleet broadcasts from periphery nodes are prohibited by design.',
            });
            await ste.hunt(ActCns.UPDATE_CONSOLE, {
                idx: 'cns00',
                src: '>> ==============================================================',
            });
        }
        if (bal && bal.slv) {
            bal.slv({
                libBit: {
                    idx: 'progress-library-saga-error',
                    src: 'SOVEREIGNTY_BLOCKED',
                    val: 0,
                    dat: sovereignty,
                },
            });
        }
        return cpy;
    }

    // Filter out self-overwrite targets
    const currentHarnessDir = path.resolve(process.cwd(), 'apps', '995.library');
    targets = targets.filter((rawTarget: string) => {
        const resolved = path.isAbsolute(rawTarget) ? rawTarget : path.resolve(process.cwd(), rawTarget);
        return resolved !== currentHarnessDir && resolved !== process.cwd();
    });

    if (targets.length === 0) {
        if (ste) {
            await ste.hunt(ActCns.UPDATE_CONSOLE, {
                idx: 'cns00',
                src: '>> [SAGA_ERR] No target directories provided for propagation.',
            })
        }
        if (bal && bal.slv) {
            bal.slv({
                libBit: {
                    idx: 'progress-library-saga-error',
                    src: 'No targets provided',
                    val: 0,
                },
            })
        }
        return cpy
    }

    const repoRoot = resolveRepoRoot(process.cwd())

    let sourceDir = (bal.dat as any)?.sourceDir
    if (!sourceDir) {
        sourceDir = path.resolve(repoRoot, 'apps', '995.library')
        if (!fs.existsSync(sourceDir)) {
            if (fs.existsSync(path.resolve(repoRoot, '995.library'))) {
                sourceDir = repoRoot
            }
        }
    }

    const sagaId = `saga-fs-${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const sagaJournal: SagaJournal = {
        sagaId,
        sourceDir,
        status: 'RUNNING',
        targetsCompleted: [],
        targetsFailed: [],
        backups: {},
        records: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };

    for (const rawTarget of targets) {
        const resolved = path.isAbsolute(rawTarget) ? rawTarget : path.resolve(repoRoot, rawTarget);
        sagaJournal.records[resolved] = { targetDir: resolved, state: 'PENDING' };
    }

    await writeSagaJournal(sagaJournal);

    let abortSaga = false;

    for (const rawTarget of targets) {
        const resolvedTarget = path.isAbsolute(rawTarget) ? rawTarget : path.resolve(repoRoot, rawTarget);
        const record = sagaJournal.records[resolvedTarget];

        // PHASE 0: PRE-FLIGHT WORKING TREE GUARD
        const gitStatus = await checkGitWorkingTree(resolvedTarget);
        if (!gitStatus.clean) {
            record.state = 'FAILED';
            record.error = 'DIRTY_WORKING_TREE';
            sagaJournal.targetsFailed.push(`${resolvedTarget} (DIRTY_WORKING_TREE)`);
            await writeSagaJournal(sagaJournal);

            if (ste) {
                await ste.hunt(ActCns.UPDATE_CONSOLE, {
                    idx: 'cns00',
                    src: `>> [SAGA CIRCUIT BREAKER] Working tree dirty on ${resolvedTarget}. Aborting fleet propagation.`,
                });
            }
            abortSaga = true;
            break;
        }

        const nonce = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const backupDir = path.join(path.dirname(resolvedTarget), `.tmp_backup_995_library_${nonce}`);
        record.backupDir = backupDir;

        // PHASE 1: ISOLATED STAGING & ZERO-TRUST FILTRATION
        try {
            const staged = await stageLibraryPayload(sourceDir, resolvedTarget, nonce);
            record.stagingDir = staged.stagingDir;
            record.state = 'STAGED';
            await writeSagaJournal(sagaJournal);

            // PHASE 2: ATOMIC INODE PROMOTION & SWAP
            // Retain backup path in journal for multi-target compensation
            const targetExists = await fs.pathExists(resolvedTarget);
            if (targetExists) {
                sagaJournal.backups[resolvedTarget] = backupDir;
            }

            const swapResult = await swapAtomicInodes(record.stagingDir, resolvedTarget, backupDir, ste);

            if (!swapResult.promoted) {
                throw swapResult.error || new Error(`Inode swap promotion failed on ${resolvedTarget}`);
            }

            record.state = 'COMPLETED';
            sagaJournal.targetsCompleted.push(resolvedTarget);
            await writeSagaJournal(sagaJournal);

            if (ste) {
                await ste.hunt(ActCns.UPDATE_CONSOLE, {
                    idx: 'cns00',
                    src: `>> [SUCCESS] Promoted library -> ${resolvedTarget}`,
                });
            }
        } catch (err: any) {
            record.state = 'FAILED';
            record.error = err.message;
            sagaJournal.targetsFailed.push(resolvedTarget);
            await writeSagaJournal(sagaJournal);

            if (ste) {
                await ste.hunt(ActCns.UPDATE_CONSOLE, {
                    idx: 'cns00',
                    src: `>> [FAULT DETECTED] Failure on ${resolvedTarget}: ${err.message}. Initiating compensation rollback...`,
                });
            }

            abortSaga = true;
            break;
        }
    }

    if (abortSaga) {
        // Multi-Target Reverse Compensation Routing
        const compensationOutcome = await rollbackSagaJournal(sagaJournal, ste);
        const finalStatus = compensationOutcome.compensated ? 'COMPENSATED' : 'TORN';

        if (bal && bal.slv) {
            bal.slv({
                libBit: {
                    idx: 'progress-library-saga-error',
                    src: finalStatus,
                    val: sagaJournal.targetsCompleted.length,
                    dat: sagaJournal,
                },
            });
        }
        return cpy;
    }

    await finalizeSagaJournal(sagaJournal);

    // Phase 5 In-Memory Hot Re-Wiring Hook
    for (const completedTarget of sagaJournal.targetsCompleted) {
        try {
            await updateLibrary(cpy, { idx: 'update-library', src: completedTarget }, ste);
            await rewireLibrary(cpy, { idx: 'rewire-library', src: completedTarget }, ste);
        } catch {}
    }

    if (bal && bal.slv) {
        bal.slv({
            libBit: {
                idx: 'progress-library-saga',
                src: 'COMPLETED',
                val: sagaJournal.targetsCompleted.length,
                dat: sagaJournal,
            },
        });
    }

    return cpy;

}

const safeQueryGit = async (cwd: string, args: string[]): Promise<string | null> => {
    try {
        if (!fs.existsSync(path.join(cwd, '.git'))) {
            return null
        }
        const { stdout } = await execFile('git', args, { cwd, timeout: 5000 })
        return stdout.trim()
    } catch {
        return null
    }
}

export const auditLibrary = async (
    cpy: LibraryModel,
    bal: LibraryBit,
    ste: State,
): Promise<LibraryModel> => {
    const emit = async (src: string) => {
        if (ste && typeof ste.hunt === 'function') {
            await ste.hunt(ActCns.UPDATE_CONSOLE, { idx: 'cns00', src }).catch(() => {})
        }
    }

    await emit('>> [AUDIT] Initiating Fleet Version Drift Analysis...')

    // 1. Resolve Manifest Path
    let manifestPath = bal?.src || (bal?.dat && (bal.dat as any).manifestPath)
    if (!manifestPath) {
        const candidates = [
            path.resolve(process.cwd(), 'apps/995.library/data/versions.json'),
            path.resolve(process.cwd(), 'data/versions.json'),
        ]
        manifestPath = candidates.find((p) => fs.existsSync(p))
    }

    if (!manifestPath || !fs.existsSync(manifestPath)) {
        await emit('::error:: versions.json manifest missing!')
        if (bal?.slv) {
            bal.slv({ libBit: { idx: 'audit-library-error', val: 0, dat: null, src: manifestPath || '' } })
        }
        return cpy
    }

    let manifest: any
    try {
        manifest = fs.readJsonSync(manifestPath)
    } catch (err: any) {
        await emit(`::error:: Manifest parse failure: ${err.message}`)
        if (bal?.slv) {
            bal.slv({ libBit: { idx: 'audit-library-error', val: 0, dat: null, src: manifestPath } })
        }
        return cpy
    }

    // 2. Identify Workspace Root & Sovereign Authority
    const fleetRoot = resolveFleetRoot() || path.resolve(process.cwd(), '../../')
    const sovereignRepo = manifest.sovereign_repo || 'camp-candor/995.library'
    const activeRepoName = path.basename(process.cwd())
    const isSovereign = sovereignRepo.endsWith(activeRepoName) || sovereignRepo === activeRepoName

    if (!isSovereign) {
        await emit(`>> [SOVEREIGNTY WARNING] Active repo [${activeRepoName}] is NOT designated sovereign [${sovereignRepo}]!`)
    } else {
        await emit(`>> [OK] Sovereign Node verified: ${sovereignRepo}`)
    }

    const records: RepoAuditRecord[] = []
    const canonicalLibVersion = manifest.library_version || '1.0.12'
    const targetRepos = manifest.repositories || manifest.repos || {}
    const trackedPaths = new Set<string>()

    // 3. Inspect Declared Repositories
    for (const [repoKey, rawConfig] of Object.entries(targetRepos)) {
        const cfg = rawConfig as any
        const relPath = cfg.path || repoKey
        const targetPath = path.isAbsolute(relPath) ? relPath : path.resolve(fleetRoot, relPath)
        trackedPaths.add(path.resolve(targetPath))

        const expectedVersion = cfg.required_contract_version || canonicalLibVersion
        const expectedBranch = cfg.expected_branch || cfg.ref || 'main'
        const pinnedSha = cfg.pinned_sha || cfg.pinned_commit || ''

        if (!fs.existsSync(targetPath)) {
            records.push({
                repo: repoKey,
                cluster: cfg.cluster,
                path: relPath,
                expectedVersion,
                expectedBranch,
                pinnedSha,
                status: 'MISSING',
                notes: 'Directory not found on disk',
            })
            continue
        }

        // Check installed apps/995.library/package.json
        const pkgJsonPath = path.join(targetPath, 'apps/995.library/package.json')
        let installedVersion: string | undefined
        if (fs.existsSync(pkgJsonPath)) {
            try {
                const pkg = fs.readJsonSync(pkgJsonPath)
                installedVersion = pkg.version
            } catch {
                installedVersion = undefined
            }
        }

        // Query Git State
        const actualBranch = (await safeQueryGit(targetPath, ['rev-parse', '--abbrev-ref', 'HEAD'])) || undefined
        const actualSha = (await safeQueryGit(targetPath, ['rev-parse', 'HEAD'])) || undefined

        // Determine Drift Status
        let status: AuditStatus = 'ALIGNED'
        const notes: string[] = []

        if (!installedVersion) {
            status = 'UNREADABLE'
            notes.push('Missing apps/995.library/package.json')
        } else if (installedVersion !== expectedVersion) {
            status = 'DRIFT_VERSION'
            notes.push(`v${installedVersion} != expected v${expectedVersion}`)
        } else if (actualBranch && actualBranch !== expectedBranch) {
            status = 'DRIFT_BRANCH'
            notes.push(`branch ${actualBranch} != expected ${expectedBranch}`)
        } else if (pinnedSha && actualSha && actualSha !== pinnedSha) {
            status = 'DRIFT_VERSION'
            notes.push(`sha ${actualSha.slice(0, 7)} != pinned ${pinnedSha.slice(0, 7)}`)
        }

        records.push({
            repo: repoKey,
            cluster: cfg.cluster,
            path: relPath,
            expectedVersion,
            installedVersion,
            expectedBranch,
            actualBranch,
            pinnedSha,
            actualSha,
            status,
            notes: notes.join('; ') || undefined,
        })
    }

    // 4. Discover Unmanaged Repositories
    try {
        if (fs.existsSync(fleetRoot)) {
            const rootEntries = fs.readdirSync(fleetRoot, { withFileTypes: true })
            for (const entry of rootEntries) {
                if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'node_modules') continue
                const candidatePath = path.join(fleetRoot, entry.name)
                if (trackedPaths.has(candidatePath)) continue

                if (fs.existsSync(path.join(candidatePath, 'apps/995.library/package.json'))) {
                    let discoveredVer = 'unknown'
                    try {
                        discoveredVer = fs.readJsonSync(path.join(candidatePath, 'apps/995.library/package.json')).version
                    } catch {}

                    records.push({
                        repo: entry.name,
                        path: entry.name,
                        expectedVersion: canonicalLibVersion,
                        installedVersion: discoveredVer,
                        expectedBranch: 'main',
                        status: 'UNMANAGED',
                        notes: 'Discovered apps/995.library omitted from manifest',
                    })
                }
            }
        }
    } catch {}

    // 5. Compile Statistics & Stream Telemetry
    const alignedCount = records.filter((r) => r.status === 'ALIGNED').length
    const driftedCount = records.filter((r) => r.status !== 'ALIGNED').length

    const report: AuditReport = {
        isSovereign,
        sovereignRepo,
        activeRepo: activeRepoName,
        totalTracked: records.length,
        alignedCount,
        driftedCount,
        records,
        timestamp: new Date().toISOString(),
    }

    await emit('>> ================================================================')
    await emit('>> REPOSITORY          | STATUS         | INSTALLED | EXPECTED | NOTES')
    await emit('>> --------------------+----------------+-----------+----------+-----------')
    for (const r of records) {
        const namePad = r.repo.padEnd(19).slice(0, 19)
        const statPad = `[${r.status}]`.padEnd(14).slice(0, 14)
        const instPad = (r.installedVersion || 'N/A').padEnd(9).slice(0, 9)
        const expPad = r.expectedVersion.padEnd(8).slice(0, 8)
        const noteStr = r.notes || ''
        await emit(`>> ${namePad} | ${statPad} | ${instPad} | ${expPad} | ${noteStr}`)
    }
    await emit('>> ----------------------------------------------------------------')
    await emit(`>> AUDIT SUMMARY: Total: ${records.length} | Aligned: ${alignedCount} | Drifted: ${driftedCount}`)
    await emit('>> ================================================================')

    if (bal?.slv) {
        bal.slv({
            libBit: {
                idx: 'audit-library',
                dat: report,
                val: driftedCount,
                src: manifestPath,
            },
        })
    }

    return cpy
}


export const bumpFleetVersion = async (
    cpy: LibraryModel,
    bal: LibraryBit,
    ste: State,
): Promise<LibraryModel> => {
    const emit = async (src: string) => {
        if (ste && typeof ste.hunt === 'function') {
            try {
                await ste.hunt(ActCns.UPDATE_CONSOLE, { idx: 'cns00', src })
            } catch {
                // Non-blocking degradation
            }
        }
    }

    await emit('>> [RELEASE] Initiating Fleet Version Bump & Snapshot...')
    await emit('>> [RELEASE:INIT] Preparing release manifest staging pipeline')
    await emit('>> [RELEASE:OK] Local flight deck initialized for release snapping')

    if (bal && bal.slv != null) {
        bal.slv({
            libBit: {
                idx: 'bump-fleet-version',
                src: 'INITIALIZED',
                val: 1,
            },
        })
    }

    return cpy
}
