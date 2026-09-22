import * as ActCns from '../../83.console.unit/console.action'

import type { UnitModel } from '../unit.model'
import type UnitBit from '../fce/unit.bit'
import type State from '../../99.core/state'

const isRepoRoot = (dir: string) => {
    const fs = require('fs')
    const path = require('path')
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

export const initUnit = (cpy: UnitModel, _bal: UnitBit, _ste: State) => {
    debugger
    return cpy
}

export const flattenUnit = async (cpy: UnitModel, bal: UnitBit, ste: State) => {
    const fs = require('fs-extra')
    const path = require('path')

    let repoRoot = process.cwd()
    while (repoRoot && !isRepoRoot(repoRoot)) {
        const parent = path.dirname(repoRoot)
        if (parent === repoRoot) break
        repoRoot = parent
    }

    let sourceDir = bal.src
    if (!sourceDir && bal.idx) {
        if (fs.existsSync(path.join(repoRoot, 'apps', bal.idx))) {
            sourceDir = path.join(repoRoot, 'apps', bal.idx)
        } else if (fs.existsSync(path.join(repoRoot, 'packages', bal.idx))) {
            sourceDir = path.join(repoRoot, 'packages', bal.idx)
        } else {
            sourceDir = path.resolve(repoRoot, bal.idx)
        }
    } else if (sourceDir && !path.isAbsolute(sourceDir)) {
        sourceDir = path.resolve(repoRoot, sourceDir)
    }

    const unitName = bal.idx || path.basename(sourceDir || 'unit')
    const fileName = unitName.endsWith('.txt') ? unitName : `${unitName}.txt`
    const outputDir = path.join(repoRoot, 'data', 'unit')
    const outputFile = path.join(outputDir, fileName)

    const IGNORED_DIRS = new Set([
        'node_modules',
        'dist',
        'data',
        '.git',
        '.wrangler',
    ])
    const CODE_EXTS = new Set([
        '.ts',
        '.tsx',
        '.js',
        '.jsx',
        '.cjs',
        '.mjs',
        '.json',
        '.jsonc',
        '.toml',
        '.yml',
        '.yaml',
        '.md',
        '.txt',
        '.html',
        '.css',
    ])
    const ALLOWED_FILES = new Set([
        '.gitignore',
        'package.json',
        'AGENTS.md',
        'AGENT_INSTRUCTIONS.md',
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
                if (IGNORED_DIRS.has(entry.name)) continue
                const subFiles = await getFilePaths(path.join(dir, entry.name))
                filePaths.push(...subFiles)
            } else if (entry.isFile()) {
                filePaths.push(path.join(dir, entry.name))
            }
        }
        return filePaths
    }

    try {
        if (ste) {
            await ste.hunt(ActCns.UPDATE_CONSOLE, {
                idx: 'cns00',
                src: `Scanning directory: ${sourceDir}...`,
            })
        }

        const allFiles = await getFilePaths(sourceDir)

        const codeFiles = allFiles.filter((file) => {
            const ext = path.extname(file).toLowerCase()
            const filename = path.basename(file)

            const isAllowedFile =
                ALLOWED_FILES.has(filename) || filename.startsWith('tsconfig')
            if (!CODE_EXTS.has(ext) && !isAllowedFile) return false
            if (ext === '.js') {
                const tsSibling = file.slice(0, -3) + '.ts'
                if (fs.existsSync(tsSibling)) return false
            }
            return true
        })

        codeFiles.sort((a, b) => a.localeCompare(b))

        if (ste) {
            await ste.hunt(ActCns.UPDATE_CONSOLE, {
                idx: 'cns00',
                src: `Found ${codeFiles.length} files to flatten.`,
            })
        }

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
                src: `Wrote flattened unit to: ${relOutput}`,
            })
        }

        if (bal && bal.slv != null) {
            bal.slv({
                untBit: {
                    idx: 'flatten-unit',
                    src: relOutput,
                    val: codeFiles.length,
                },
            })
        }
    } catch (err) {
        console.error('Error combining files:', err)
        if (bal && bal.slv != null) {
            bal.slv({
                untBit: {
                    idx: 'flatten-unit-err',
                    src: err instanceof Error ? err.message : String(err),
                    val: -1,
                },
            })
        }
    }

    return cpy
}

export const createUnit = (cpy: UnitModel, bal: UnitBit, ste: State) => {
    if (bal.idx == null) bal.idx = 'alligator'

    const FS = require('fs-extra')
    const path = require('path')
    const doT = require('dot')

    // 1. Resolve Repository Root
    const isRepoRoot = (dir: string) => {
        try {
            return (
                FS.existsSync(path.join(dir, 'apps')) &&
                FS.existsSync(path.join(dir, 'packages')) &&
                FS.existsSync(path.join(dir, 'package.json'))
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

    // 2. Discover Template Directory
    const templateCandidates = [
        path.join(repoRoot, 'data', '00.sim.unit'),
        path.join(repoRoot, 'apps', '995.library', 'data', '00.sim.unit'),
        path.resolve(process.cwd(), 'data', '00.sim.unit'),
    ]

    const templateDir = templateCandidates.find((dir) => FS.existsSync(dir))

    if (!templateDir) {
        const errorMsg = 'Template directory data/00.sim.unit not found'
        if (ste) {
            ste.hunt(ActCns.UPDATE_CONSOLE, {
                idx: 'cns00',
                src: `ERROR: ${errorMsg}`,
            })
        }
        if (bal.slv != null) {
            bal.slv({
                untBit: {
                    idx: 'create-unit-error',
                    src: errorMsg,
                },
            })
        }
        return cpy
    }

    // 3. Define Unit Identifiers & Target Directory
    const num = '00'
    const nom = bal.idx.toLowerCase()
    const unitFolder = `${num}.${nom}.unit`
    const targetUnitDir = path.join(repoRoot, 'data', 'unit', unitFolder)

    function capitalizeFirstLetter(string: string) {
        return string.charAt(0).toUpperCase() + string.slice(1)
    }

    const gel = {
        idx: 'together000',
        title: capitalizeFirstLetter(nom),
        nom: nom,

        wakeActionKey: nom.toUpperCase() + '_OPEN',
        initActionKey: 'INIT_' + nom.toUpperCase(),
        updateActionKey: 'UPDATE_' + nom.toUpperCase(),

        wakeActionFunction: capitalizeFirstLetter(nom),
        initActionFunction: 'Init' + capitalizeFirstLetter(nom),
        updateActionFunction: 'Update' + capitalizeFirstLetter(nom),

        bitNom: nom + 'Bit',
        bitTitle: capitalizeFirstLetter(nom) + 'Bit',
        actionLabel: capitalizeFirstLetter(nom),

        actionTitle: 'Waking ' + capitalizeFirstLetter(nom),
        initTitle: 'Init ' + capitalizeFirstLetter(nom),
        updateTitle: 'Update ' + capitalizeFirstLetter(nom),
    }

    if (ste) {
        ste.hunt(ActCns.UPDATE_CONSOLE, {
            idx: 'cns00',
            src: `Scaffolding unit [${unitFolder}] into: ${path.relative(repoRoot, targetUnitDir)}`,
        })
    }

    // 4. Collect Template Files Recursively
    function getTemplateFiles(dir: string): string[] {
        const entries = FS.readdirSync(dir, { withFileTypes: true })
        let files: string[] = []
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name)
            if (entry.isDirectory()) {
                files = files.concat(getTemplateFiles(fullPath))
            } else if (entry.isFile()) {
                files.push(fullPath)
            }
        }
        return files
    }

    const templateFiles = getTemplateFiles(templateDir)

    // 5. Compile and Output to root data/unit/00.<nom>.unit/
    templateFiles.forEach((filePath: string) => {
        const relFromTemplate = path.relative(templateDir, filePath)

        let destRel = relFromTemplate.replace(/sim/g, gel.nom)
        if (destRel.endsWith('.txt')) {
            destRel = destRel.slice(0, -4) + '.ts'
        }

        const destFile = path.join(targetUnitDir, destRel)
        const rawLines = FS.readFileSync(filePath, 'utf8').split('\n')

        const compiledLines = rawLines.map((line: string) => {
            try {
                return doT.template(line)(gel)
            } catch {
                return line
            }
        })

        const finContent = compiledLines.join('\n')

        FS.ensureFileSync(destFile)
        FS.writeFileSync(destFile, finContent, 'utf8')

        if (ste) {
            ste.hunt(ActCns.UPDATE_CONSOLE, {
                idx: 'cns00',
                src: `writing ${path.relative(repoRoot, destFile)}`,
            })
        }
    })

    const relativeResult = path
        .relative(repoRoot, targetUnitDir)
        .replace(/\\/g, '/')

    setTimeout(() => {
        if (bal.slv != null) {
            bal.slv({
                untBit: {
                    idx: 'create-unit',
                    src: relativeResult,
                    dat: { idx: bal.idx, path: targetUnitDir },
                },
            })
        }
    }, 2111)

    return cpy
}

export const containUnit = (cpy: UnitModel, bal: UnitBit, ste: State) => {
    const fs = require('fs')
    const path = require('path')

    const resultList: string[] = []
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

    function scanForUnits(dir: string, depth = 0): boolean {
        if (depth > 3) return false
        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true })
            for (const entry of entries) {
                if (!entry.isDirectory()) continue
                if (IGNORE.has(entry.name)) continue

                if (/^\d{2}\..+\.unit$/.test(entry.name)) return true
                if (scanForUnits(path.join(dir, entry.name), depth + 1))
                    return true
            }
        } catch {
            // Ignore read errors
        }
        return false
    }

    function hasDirectUnits(dir: string): boolean {
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
        } catch {
            // Ignore read errors
        }
        return false
    }

    function findPivots(dir: string, results: string[], depth = 0) {
        if (depth > 3) return
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
        } catch {
            // Ignore read errors
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
            if (ste) {
                ste.hunt(ActCns.UPDATE_CONSOLE, {
                    idx: 'cns00',
                    src: 'Scanning project: ' + entry.name,
                })
            }

            if (scanForUnits(projectPath)) {
                findPivots(projectPath, resultList)
            }
        }
    } catch (err: any) {
        console.error(`Error in containUnit: ${err.message}`)
    }

    bal.slv({ untBit: { idx: 'contain-unit', lst: resultList, src: bal.idx } })
    return cpy
}

export const testUnit = (cpy: UnitModel, _bal: UnitBit, _ste: State) => {
    debugger
    return cpy
}

export const updateUnit = async (cpy: UnitModel, bal: UnitBit, ste: State) => {
    const FS = require('fs-extra')
    const path = require('path')
    const doT = require('dot')

    let bit

    const unitBasename = path.basename(bal.idx)
    const root = unitBasename.split('.')[1] || ''

    if (!root) {
        if (ste) {
            ste.hunt(ActCns.UPDATE_CONSOLE, {
                idx: 'cns00',
                src: `ERROR: Could not extract root from ${bal.idx}`,
            })
        }
        if (bal.slv != null)
            bal.slv({
                untBit: {
                    idx: 'update-unit-error',
                    src: `Invalid unit path: ${bal.idx}`,
                },
            })
        return cpy
    }

    const rootUpper = root.charAt(0).toUpperCase() + root.slice(1)
    const nom = bal.dat
    const nomUpper = nom.charAt(0).toUpperCase() + nom.slice(1)

    if (ste) {
        ste.hunt(ActCns.UPDATE_CONSOLE, {
            idx: 'cns00',
            src: `Target unit: ${root} (${rootUpper}) in ${unitBasename}`,
        })
    }

    const buzzFile = path.resolve(bal.src, bal.idx, 'buz', root + '.buzz.ts')
    const buzzerFile = path.resolve(bal.src, bal.idx, root + '.buzzer.ts')
    const actionFile = path.resolve(bal.src, bal.idx, root + '.action.ts')
    const reduceFile = path.resolve(bal.src, bal.idx, root + '.reduce.ts')

    if (ste) {
        ste.hunt(ActCns.UPDATE_CONSOLE, {
            idx: 'cns00',
            src: `Updating unit paths: ${buzzFile}`,
        })
    }

    const existBuzz = FS.existsSync(buzzFile)
    const existBuzzer = FS.existsSync(buzzerFile)
    const existAction = FS.existsSync(actionFile)
    const existReduce = FS.existsSync(reduceFile)

    if (!existBuzz || !existAction || !existReduce || !existBuzzer) {
        if (bal.slv != null)
            bal.slv({
                untBit: {
                    idx: 'update-unit-error',
                    src: 'no exist on source file',
                },
            })
        return cpy
    }

    const listBuzz = FS.readFileSync(buzzFile).toString().split('\n')
    const listBuzzer = FS.readFileSync(buzzerFile).toString().split('\n')
    const listAction = FS.readFileSync(actionFile).toString().split('\n')
    const listReduce = FS.readFileSync(reduceFile).toString().split('\n')

    const updateBuzz = (lst: string[]) => {
        const out: string[] = []
        const buzNom = nom + rootUpper
        const cpyNom = rootUpper + 'Model'
        const balNom = rootUpper + 'Bit'
        const lineList = cpy.buzzTemplate.toString().split('\n')
        const gel = { buzNom, cpyNom, balNom }

        out.push('')
        lineList.forEach((a) => {
            const doTCompiled = doT.template(a)
            out.push(doTCompiled(gel))
        })
        return { lst: lst.concat(out) }
    }

    const updateActionUpper = (lst: string[]) => {
        const out: string[] = []
        let dex = 0
        lst.forEach((a, b) => {
            if (a.includes('export type Actions') == true) dex = b
        })
        let actUpr = nom + '_' + rootUpper
        actUpr = actUpr.toUpperCase()
        const actMsg = '[' + nomUpper + ' action] ' + nomUpper + ' ' + rootUpper
        const actTle = nomUpper + rootUpper
        const lineList = cpy.actTemplate.toString().split('\n')
        const gel = { actUpr, actMsg, actTle }
        lineList.forEach((a) => {
            const doTCompiled = doT.template(a)
            out.push(doTCompiled(gel))
        })
        return { lst: out, val: dex }
    }

    const updateActionLower = (lst: string[]) => {
        const out: string[] = []
        let dex = 0
        lst.forEach((a, b) => {
            if (a.includes('export type Actions =') == true) dex = b
        })
        const actTle = nomUpper + rootUpper
        const lineList = cpy.actTemplateLower.toString().split('\n')
        const gel = { actTle }
        lineList.forEach((a) => {
            const doTCompiled = doT.template(a)
            out.push(doTCompiled(gel))
        })
        return { lst: out, val: dex }
    }

    const updateReduce = (lst: string[]) => {
        const out: string[] = []
        let dex = 0
        lst.forEach((a, b) => {
            if (a.includes('default') == true) dex = b
        })
        let actUpr = nom + '_' + rootUpper
        actUpr = actUpr.toUpperCase()
        const actTle = nom + rootUpper
        const lineList = cpy.reduceTemplate.toString().split('\n')
        const gel = { actUpr, actTle }
        lineList.forEach((a) => {
            const doTCompiled = doT.template(a)
            out.push(doTCompiled(gel))
        })
        return { lst: out, val: dex }
    }

    const updateBuzzer = (lst: string[]) => {
        const actTle = nom + rootUpper
        const lineList = cpy.buzzerTemplate.toString().split('\n')
        const gel = { actTle, root }
        lineList.forEach((a) => {
            const doTCompiled = doT.template(a)
            lst.push(doTCompiled(gel))
        })
        return { lst }
    }

    const buzzBit = updateBuzz(listBuzz)
    const buzzerBit = updateBuzzer(listBuzzer)
    const actionUpperBit = updateActionUpper(listAction)
    const actionLowerBit = updateActionLower(listAction)
    const reduceBit = updateReduce(listReduce)

    const merge = (a: any[], b: any[], i = 0) => {
        return a.slice(0, i).concat(b, a.slice(i))
    }

    const resultBuzz = buzzBit.lst
    const resultBuzzer = buzzerBit.lst.filter((e) => e.length > 2)
    const resultReduce = merge(listReduce, reduceBit.lst, reduceBit.val)
    let resultActionUpper = merge(
        listAction,
        actionUpperBit.lst,
        actionUpperBit.val,
    )
    const upperActionDex = updateActionUpper(resultActionUpper).val
    const lowerDex = actionLowerBit.val
    let lowerActionList = listAction.slice(lowerDex, listAction.length)
    lowerActionList.forEach((a, b) => {
        lowerActionList[b] = a.replace(';', '')
    })
    lowerActionList = lowerActionList.filter((e) => e.length >= 2)
    lowerActionList.push('| ' + nomUpper + rootUpper)
    lowerActionList.unshift(' ')
    resultActionUpper = resultActionUpper.slice(0, upperActionDex)
    const resultAction = resultActionUpper.concat(lowerActionList)

    await FS.writeFile(buzzFile, resultBuzz.join('\n'))
    if (ste)
        ste.hunt(ActCns.UPDATE_CONSOLE, {
            idx: 'cns00',
            src: 'writing...' + buzzFile,
        })

    await FS.writeFile(buzzerFile, resultBuzzer.join('\n'))
    if (ste)
        ste.hunt(ActCns.UPDATE_CONSOLE, {
            idx: 'cns00',
            src: 'writing...' + buzzerFile,
        })

    await FS.writeFile(reduceFile, resultReduce.join('\n'))
    if (ste)
        ste.hunt(ActCns.UPDATE_CONSOLE, {
            idx: 'cns00',
            src: 'writing...' + reduceFile,
        })

    await FS.writeFile(actionFile, resultAction.join('\n'))
    if (ste)
        ste.hunt(ActCns.UPDATE_CONSOLE, {
            idx: 'cns00',
            src: 'writing...' + actionFile,
        })

    setTimeout(() => {
        if (bal.slv != null)
            bal.slv({ untBit: { idx: 'update-unit', dat: bal } })
    }, 2111)

    return cpy
}

export const listUnit = (cpy: UnitModel, bal: UnitBit, ste: State) => {
    const FS = require('fs-extra')
    const path = require('path')

    const resultList: string[] = []
    const targetDir = path.resolve(bal.src)
    let parentDir = process.cwd()
    while (parentDir && !isRepoRoot(parentDir)) {
        const parent = path.dirname(parentDir)
        if (parent === parentDir) break
        parentDir = parent
    }

    try {
        if (FS.existsSync(targetDir)) {
            const entries = FS.readdirSync(targetDir, { withFileTypes: true })

            for (const entry of entries) {
                if (!entry.isDirectory()) continue
                if (/^\d{2}\..+\.unit$/.test(entry.name)) {
                    const relativeDir = path
                        .relative(parentDir, targetDir)
                        .replace(/\\/g, '/')
                    const depth = relativeDir.split('/').filter(Boolean).length
                    const upDots = '../'.repeat(depth)
                    resultList.push(`${upDots}${relativeDir}/${entry.name}`)
                }
            }
        }
    } catch (err: any) {
        console.error(`Error in listUnit: ${err.message}`)
    }

    if (ste) {
        ste.hunt(ActCns.UPDATE_CONSOLE, {
            idx: 'cns00',
            src: `Listing units in ${bal.src}: found ${resultList.length}`,
        })
    }

    bal.slv({ untBit: { idx: 'list-unit', lst: resultList, src: bal.idx } })
    return cpy
}
