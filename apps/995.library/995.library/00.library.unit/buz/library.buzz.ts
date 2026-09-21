import type { LibraryModel } from '../library.model'
import type LibraryBit from '../fce/library.bit'
import type State from '../../99.core/state'

import * as ActMnu from '../../98.menu.unit/menu.action'
import * as ActBus from '../../99.bus.unit/bus.action'
import * as ActCns from '../../83.console.unit/console.action'

import * as ActLib from '../library.action'

let bit, val, idx, dex, lst, dat

const exec = require('child_process').exec

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
    if (bal.slv != null) bal.slv({ intBit: { idx: 'init-mythos' } })

    return cpy
}

export const listLibrary = (cpy: LibraryModel, bal: LibraryBit, ste: State) => {
    const fs = require('fs')
    const path = require('path')

    const resultList = []
    const parentDir = process.cwd()
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
    const FS = require('fs-extra')
    const doT = require('dot')
    const S = require('string')
    const path = require('path')

    let title = '995.library'
    const file = './data/redux/BEE.txt'
    const fileFin = './data/redux/BEE.ts'

    title = bal.src
    if (title) title = title.replace(/[\[\]]/g, '')

    function capitalizeFirstLetter(string) {
        return string.charAt(0).toUpperCase() + string.slice(1)
    }

    const targetDir = path.resolve(title)
    const list = FS.readdirSync(targetDir)
    const lineList = FS.readFileSync(file).toString().split('\n')

    const out = []
    const dirList = []

    const itemList = []

    list.forEach(async (a, b) => {
        const checkPath = path.join(targetDir, a)

        if (FS.lstatSync(checkPath).isDirectory()) {
            if (S(checkPath).contains('unit') == false) return

            const directory = checkPath + '/'
            const element = a.split('.')[1]

            const unitName = capitalizeFirstLetter(element)

            const unitImportSrc = './' + a + '/' + element + '.unit'
            const unitImportSte =
                'import ' + unitName + 'Unit from "' + unitImportSrc + '";'

            const faceImportSrc = './' + a + '/fce/' + element + '.interface'
            const faceImportSte =
                'import ' + unitName + ' from "' + faceImportSrc + '";'

            const modlImportSrc = './' + a + '/' + element + '.model'
            const modlImportSte =
                'import { ' + unitName + 'Model } from "' + modlImportSrc + '";'

            const redcImportSrc = './' + a + '/' + element + '.reduce'
            const redcImportSte =
                'import * as reduceFrom' +
                unitName +
                ' from "' +
                redcImportSrc +
                '";'

            const reduced = element + ' : reduceFrom' + unitName + '.reducer'
            const model =
                element + ' : ' + unitName + ' = new ' + unitName + 'Model();'

            const item = {
                model,
                reduced,
                redcI: redcImportSte,
                modlI: modlImportSte,
                facI: faceImportSte,
                untI: unitImportSte,
                unitName,
                element,
            }

            itemList.push(item)
        }
    })

    let unitImports = ''
    itemList.forEach((a) => {
        unitImports += a.untI + '\n'
    })

    let faceImports = ''
    itemList.forEach((a) => {
        faceImports += a.facI + '\n'
        faceImports += a.modlI + '\n'
    })

    const unitListNom = []
    itemList.forEach((a) => {
        unitListNom.push(a.unitName + 'Unit')
    })

    let unitList = JSON.stringify(unitListNom) + ';'
    unitList = S(unitList).replaceAll('"', '')

    let reduceImports = ''
    itemList.forEach((a) => {
        reduceImports += a.redcI + '\n'
    })

    let reduceList = ''
    itemList.forEach((a, b) => {
        //if (b == reduceList.length - 1) return;
        reduceList += a.reduced + ', \n'
    })

    //reduceList += itemList[itemList.length - 1].reduced + "\n";

    let modelList = ''
    itemList.forEach((a, b) => {
        modelList += a.model + '\n'
    })

    const gel = {
        unitImports,
        faceImports,
        unitList,
        reduceImports,
        reduceList,
        modelList,
    }

    const writeLine = []

    lineList.forEach(async (a, b) => {
        if (S(a).contains('//')) return

        const doTCompiled = doT.template(a)
        const outLine = doTCompiled(gel)

        writeLine.push(outLine)
    })

    writeLine.forEach(async (a) => {
        bit = await ste.hunt(ActCns.UPDATE_CONSOLE, {
            idx: 'cns00',
            src: 'line : ' + a,
        })
    })

    const finFile = writeLine.join('\n')

    FS.ensureFileSync(fileFin)

    const endLoc = path.join(targetDir, 'BEE.ts')

    finFile

    FS.writeFileSync(endLoc, finFile)

    bit = await ste.hunt(ActCns.UPDATE_CONSOLE, {
        idx: 'cns00',
        src: 'writing ' + endLoc,
    })

    bal.slv({ libBit: { idx: 'update-library' } })
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

export const scanLibrary = (cpy: LibraryModel, bal: LibraryBit, ste: State) => {
    /**
     * Scans sibling directories to find other workspaces containing an `apps/995.library` folder.
     *
     * It moves up one level from the current repository root and inspects all adjacent directories.
     * If a sibling repository contains an `apps/995.library` path, its relative path (from the current
     * process root) is added to the results list. This list can then be used to synchronize or
     * "progress" the library across different projects.
     */
    const fs = require('fs')
    const path = require('path')

    const resultList: string[] = []
    const parentDir = path.resolve(process.cwd(), '..')

    try {
        const entries = fs.readdirSync(parentDir, { withFileTypes: true })

        for (const entry of entries) {
            if (!entry.isDirectory()) continue

            const itemPath = path.join(parentDir, entry.name)

            // Skip the current repo
            if (itemPath === process.cwd()) continue

            const libraryDir = path.join(itemPath, 'apps', '995.library')
            if (fs.existsSync(libraryDir)) {
                const relativePath = path.relative(process.cwd(), libraryDir)
                resultList.push(`[${relativePath.replace(/\\/g, '/')}]`)
            }
        }
    } catch (err: any) {
        console.error(`Error in scanLibrary: ${err.message}`)
    }

    if (bal.slv) bal.slv({ libBit: { idx: 'scan-library', lst: resultList } })

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
    const { exec } = require('child_process')

    const filePath = path.resolve(process.cwd(), 'data/launch.txt')

    if (fs.existsSync(filePath)) {
        const fileContent = fs.readFileSync(filePath, 'utf-8')
        const urls = fileContent
            .split('\n')
            .map((url: string) => url.trim())
            .filter((url: string) => url.length > 0)

        for (const url of urls) {
            let command
            switch (process.platform) {
                case 'darwin':
                    command = `open "${url}"`
                    break
                case 'win32':
                    command = `start "" "${url}"`
                    break
                default:
                    command = `xdg-open "${url}"`
                    break
            }

            exec(command, (error: any) => {
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

    // Resolve repository root directory
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

    if (ste)
        await ste.hunt(ActCns.UPDATE_CONSOLE, {
            idx: 'cns00',
            src: 'Starting Flat Library...',
        })

    const IGNORED_DIRS = new Set(['node_modules', 'dist', 'data', '.git'])
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
    const ALLOWED_FILES = new Set(['.gitignore', 'package.json'])

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
                // Skip ignored directories, but allow any directory named "schema"
                if (IGNORED_DIRS.has(entry.name) && entry.name !== 'schema') {
                    continue
                }
                const subFiles = await getFilePaths(path.join(dir, entry.name))
                filePaths.push(...subFiles)
            } else if (entry.isFile()) {
                // Exclude README.md
                if (entry.name.toLowerCase() === 'readme.md') {
                    continue
                }
                filePaths.push(path.join(dir, entry.name))
            }
        }

        return filePaths
    }

    try {
        const targetRoots = ['apps', 'packages', '.github', '.'].map((folder) =>
            path.join(repoRoot, folder),
        )
        const allScannedFiles: string[] = []

        for (const targetRoot of targetRoots) {
            if (!fs.existsSync(targetRoot)) continue

            if (targetRoot === repoRoot) {
                // Special case for root to avoid scanning everything again
                const subEntries = await fs.readdir(targetRoot, {
                    withFileTypes: true,
                })
                for (const entry of subEntries) {
                    if (entry.isFile()) {
                        allScannedFiles.push(path.join(targetRoot, entry.name))
                    }
                }
            } else if (path.basename(targetRoot) === '.github') {
                // Specifically scan .github
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

        // Filter for code files
        const codeFiles = allScannedFiles.filter((file) => {
            const ext = path.extname(file)
            const filename = path.basename(file)

            const isAllowedFile =
                ALLOWED_FILES.has(filename) || filename.startsWith('tsconfig')

            if (!CODE_EXTS.has(ext) && !isAllowedFile) return false
            // If it's a JS file and a corresponding TS file exists in the same folder, skip the compiled duplicate
            if (ext === '.js') {
                const tsSibling = file.slice(0, -3) + '.ts'
                if (fs.existsSync(tsSibling)) return false
            }
            return true
        })

        // Sort files deterministically
        codeFiles.sort((a, b) => a.localeCompare(b))

        if (ste) {
            await ste.hunt(ActCns.UPDATE_CONSOLE, {
                idx: 'cns00',
                src: `Found ${codeFiles.length} code files to flatten.`,
            })
        }

        // Read content of all files
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
                src: `Wrote flattened library to: ${relOutput}`,
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
                src: `Error flattening library: ${err.message}`,
            })
        }
        if (bal && bal.slv != null) {
            bal.slv({ libBit: { idx: 'flat-library-error', src: err.message } })
        }
    }

    return cpy
}
