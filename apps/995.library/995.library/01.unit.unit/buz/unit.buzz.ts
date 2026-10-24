import * as ActCns from '../../83.console.unit/console.action'
import * as ActLib from '../../00.library.unit/library.action'

import type { UnitModel } from '../unit.model'
import type UnitBit from '../fce/unit.bit'
import type State from '../../99.core/state'

const isRepoRoot = (dir: string): boolean => {
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

const findRepoRoot = (startDir: string = process.cwd()): string => {
    const path = require('path')
    let curr = path.resolve(startDir)
    while (curr && curr !== path.dirname(curr)) {
        if (isRepoRoot(curr)) return curr
        curr = path.dirname(curr)
    }
    return process.cwd()
}

export const initUnit = (cpy: UnitModel, _bal: UnitBit, _ste: State) => {
    return cpy
}

export const testUnit = (cpy: UnitModel, _bal: UnitBit, _ste: State) => {
    return cpy
}

export const flattenUnit = async (cpy: UnitModel, bal: UnitBit, ste: State) => {
    const fs = require('fs-extra')
    const path = require('path')

    const repoRoot = findRepoRoot()

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

export const createUnit = async (
    cpy: UnitModel,
    bal: UnitBit,
    ste: State,
): Promise<UnitModel> => {
    const FS = require('fs-extra')
    const path = require('path')
    const doT = require('dot')

    // 1. Resolve Root Repository Context
    const repoRoot = findRepoRoot()
    const rawNom = bal.idx || 'alligator'

    // 2. Discover Template Directory with Robust Multi-Candidate Discovery
    const templateCandidates = [
        path.join(repoRoot, 'data', '00.sim.unit'),
        path.join(repoRoot, 'apps', '995.library', 'data', '00.sim.unit'),
        path.join(repoRoot, 'apps', '995.library', '995.library', 'data', '00.sim.unit'),
        path.resolve(process.cwd(), 'data', '00.sim.unit'),
    ]

    const templateDir = templateCandidates.find((dir) => FS.existsSync(dir))

    if (!templateDir) {
        const errorMsg = 'Template directory data/00.sim.unit not found'
        if (ste) {
            await ste.hunt(ActCns.UPDATE_CONSOLE, {
                idx: 'cns00',
                src: `:: [FAIL] ${errorMsg}`,
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

    // 3. Define Unit Identifiers & Prefix
    let num = '00'
    let nom = rawNom.toLowerCase()

    if (/^\d{2}\./.test(rawNom)) {
        const parts = rawNom.split('.')
        num = parts[0]
        nom = parts.slice(1).join('.').toLowerCase()
    }

    const unitFolder = `${num}.${nom}.unit`

    // 4. Parameterized Canonical Target Resolution
    let targetUnitDir: string
    if (bal.src) {
        const resolvedSrc = path.isAbsolute(bal.src)
            ? bal.src
            : path.resolve(repoRoot, bal.src)

        targetUnitDir = path.basename(resolvedSrc) === unitFolder
            ? resolvedSrc
            : path.join(resolvedSrc, unitFolder)
    } else {
        // Direct storehouse emission default into root data/unit
        targetUnitDir = path.join(repoRoot, 'data', 'unit', unitFolder)
    }

    function capitalizeFirstLetter(string: string) {
        return string.charAt(0).toUpperCase() + string.slice(1)
    }

    const gel = {
        idx: `${nom}000`,
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
        await ste.hunt(ActCns.UPDATE_CONSOLE, {
            idx: 'cns00',
            src: `>> [SCAFFOLD] Provisioning [${unitFolder}] into: ${path.relative(repoRoot, targetUnitDir).replace(/\\/g, '/')}`,
        })
    }

    // 5. Asynchronous Recursive Template Ingestion
    async function getTemplateFiles(dir: string): Promise<string[]> {
        const entries = await FS.readdir(dir, { withFileTypes: true })
        let files: string[] = []
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name)
            if (entry.isDirectory()) {
                const subFiles = await getTemplateFiles(fullPath)
                files = files.concat(subFiles)
            } else if (entry.isFile()) {
                files.push(fullPath)
            }
        }
        return files
    }

    const templateFiles = await getTemplateFiles(templateDir)

    // 6. Compile and Output Asynchronously
    for (const filePath of templateFiles) {
        const relFromTemplate = path.relative(templateDir, filePath)

        let destRel = relFromTemplate.replace(/sim/g, gel.nom)
        if (destRel.endsWith('.txt')) {
            destRel = destRel.slice(0, -4) + '.ts'
        }

        const destFile = path.join(targetUnitDir, destRel)
        const rawContent = await FS.readFile(filePath, 'utf8')
        const rawLines = rawContent.split('\n')

        const compiledLines = rawLines.map((line: string) => {
            try {
                return doT.template(line)(gel)
            } catch {
                return line
            }
        })

        const finContent = compiledLines.join('\n')

        await FS.outputFile(destFile, finContent, 'utf8')

        if (ste) {
            await ste.hunt(ActCns.UPDATE_CONSOLE, {
                idx: 'cns00',
                src: `>> [OK] writing ${path.relative(repoRoot, destFile).replace(/\\/g, '/')}`,
            })
        }
    }

    const relativeResult = path
        .relative(repoRoot, targetUnitDir)
        .replace(/\\/g, '/')

    // 7. Automated Manifest (BEE.ts) Re-Wiring Hook
    if (ste && (bal.dat as any)?.autoWire !== false) {
        const parentPkgDir = path.dirname(targetUnitDir)
        const isDataUnit =
            path.resolve(parentPkgDir) === path.resolve(repoRoot, 'data', 'unit')
        if (!isDataUnit) {
            try {
                await ste.hunt(ActLib.UPDATE_LIBRARY, { src: parentPkgDir })
            } catch {
                // Non-fatal if parent workspace lacks BEE template
            }
        }
    }

    // 8. Deterministic Zero-Delay Immediate Resolution
    if (bal.slv != null) {
        bal.slv({
            untBit: {
                idx: 'create-unit',
                src: relativeResult,
                dat: { idx: nom, path: targetUnitDir },
            },
        })
    }

    return cpy
}

export const containUnit = (cpy: UnitModel, bal: UnitBit, ste: State) => {
    const fs = require('fs')
    const path = require('path')

    const resultList: string[] = []
    const parentDir = findRepoRoot()
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
            return false
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
            return false
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
    } catch {
        // Ignore read errors
    }

    if (bal.slv != null) {
        bal.slv({ untBit: { idx: 'contain-unit', lst: resultList, src: bal.idx } })
    }
    return cpy
}

export const updateUnit = async (cpy: UnitModel, bal: UnitBit, ste: State) => {
    const FS = require('fs-extra')
    const path = require('path')
    const doT = require('dot')

    const unitBasename = path.basename(bal.idx || '')
    const root = unitBasename.split('.')[1] || ''

    if (!root) {
        if (ste) {
            await ste.hunt(ActCns.UPDATE_CONSOLE, {
                idx: 'cns00',
                src: `:: [FAIL] Could not extract root from ${bal.idx}`,
            })
        }
        if (bal.slv != null) {
            bal.slv({
                untBit: {
                    idx: 'update-unit-error',
                    src: `Invalid unit path: ${bal.idx}`,
                },
            })
        }
        return cpy
    }

    const rootUpper = root.charAt(0).toUpperCase() + root.slice(1)
    const nom = String(bal.dat || '').trim()
    if (!nom) {
        if (bal.slv != null) {
            bal.slv({
                untBit: {
                    idx: 'update-unit-error',
                    src: 'Missing action verb payload (bal.dat)',
                },
            })
        }
        return cpy
    }

    const nomUpper = nom.charAt(0).toUpperCase() + nom.slice(1)
    const actUpr = `${nom.toUpperCase()}_${rootUpper.toUpperCase()}`
    const actTle = `${nomUpper}${rootUpper}`
    const actMsg = `[${nomUpper} action] ${nomUpper} ${rootUpper}`
    const buzNom = `${nom}${rootUpper}`
    const cpyNom = `${rootUpper}Model`
    const balNom = `${rootUpper}Bit`
    const bitNom = `${rootUpper}Bit`

    if (ste) {
        await ste.hunt(ActCns.UPDATE_CONSOLE, {
            idx: 'cns00',
            src: `>> [AST:MUTATE] Injecting action ${actTle} into ${unitBasename}`,
        })
    }

    const buzzFile = path.resolve(bal.src, bal.idx, 'buz', root + '.buzz.ts')
    const buzzerFile = path.resolve(bal.src, bal.idx, root + '.buzzer.ts')
    const actionFile = path.resolve(bal.src, bal.idx, root + '.action.ts')
    const reduceFile = path.resolve(bal.src, bal.idx, root + '.reduce.ts')

    if (
        !FS.existsSync(buzzFile) ||
        !FS.existsSync(actionFile) ||
        !FS.existsSync(reduceFile) ||
        !FS.existsSync(buzzerFile)
    ) {
        if (bal.slv != null) {
            bal.slv({
                untBit: {
                    idx: 'update-unit-error',
                    src: 'One or more required unit source files do not exist',
                },
            })
        }
        return cpy
    }

    let actionContent = await FS.readFile(actionFile, 'utf8')
    let reduceContent = await FS.readFile(reduceFile, 'utf8')
    let buzzerContent = await FS.readFile(buzzerFile, 'utf8')
    let buzzContent = await FS.readFile(buzzFile, 'utf8')

    // Idempotency: skip if action is already declared
    if (actionContent.includes(`export const ${actUpr} =`)) {
        if (ste) {
            await ste.hunt(ActCns.UPDATE_CONSOLE, {
                idx: 'cns00',
                src: `>> [AST:SKIP] Action ${actUpr} already declared in ${actionFile}`,
            })
        }
        if (bal.slv != null) {
            bal.slv({ untBit: { idx: 'update-unit', dat: bal, skipped: true } })
        }
        return cpy
    }

    // 1. Mutate .action.ts
    const actGel = { actUpr, actMsg, actTle, bitNom }
    const compiledActionDecl = doT.template(cpy.actTemplate)(actGel).trim()

    // Resilient Actions Union insertion
    const actionsUnionRegex = /(export\s+type\s+Actions\s*=)([\s\S]*?)(;|$)/
    if (actionsUnionRegex.test(actionContent)) {
        actionContent = actionContent.replace(
            actionsUnionRegex,
            (_match, p1, p2) => {
                const existingTypes = p2.replace(/;+$/, '').trim()
                const updatedTypes = existingTypes.length > 0
                    ? `${existingTypes}\n    | ${actTle}`
                    : `\n    | ${actTle}`
                return `${compiledActionDecl}\n\n${p1} ${updatedTypes};`
            },
        )
    } else {
        // Fallback append if no Actions union is found
        actionContent += `\n\n${compiledActionDecl}\n`
    }

    // 2. Mutate .reduce.ts
    const reduceGel = { actUpr, actTle, buzNom }
    const compiledReduceCase = doT.template(cpy.reduceTemplate)(reduceGel)

    if (reduceContent.includes('default:')) {
        reduceContent = reduceContent.replace(
            /(\s+default:)/,
            `\n${compiledReduceCase}\n$1`,
        )
    } else if (reduceContent.includes('default')) {
        reduceContent = reduceContent.replace(
            /(\s+default)/,
            `\n${compiledReduceCase}\n$1`,
        )
    } else {
        reduceContent += `\n${compiledReduceCase}\n`
    }

    // 3. Mutate .buzzer.ts
    const buzzerGel = { actTle, root, buzNom }
    const compiledBuzzerExport = doT.template(cpy.buzzerTemplate)(buzzerGel).trim()
    if (!buzzerContent.includes(compiledBuzzerExport)) {
        buzzerContent = `${buzzerContent.trimEnd()}\n${compiledBuzzerExport}\n`
    }

    // 4. Mutate buz/.buzz.ts
    const buzzGel = { buzNom, cpyNom, balNom, nom }
    const compiledBuzzFunction = doT.template(cpy.buzzTemplate)(buzzGel).trim()
    buzzContent = `${buzzContent.trimEnd()}\n\n${compiledBuzzFunction}\n`

    // Atomically write updated files
    await FS.outputFile(actionFile, actionContent, 'utf8')
    await FS.outputFile(reduceFile, reduceContent, 'utf8')
    await FS.outputFile(buzzerFile, buzzerContent, 'utf8')
    await FS.outputFile(buzzFile, buzzContent, 'utf8')

    if (ste) {
        await ste.hunt(ActCns.UPDATE_CONSOLE, {
            idx: 'cns00',
            src: `>> [OK] Successfully injected ${actTle} across unit source files`,
        })
    }
    if (bal.slv != null) {
        bal.slv({ untBit: { idx: 'update-unit', dat: bal } })
    }

    return cpy
}

export const listUnit = (cpy: UnitModel, bal: UnitBit, ste: State) => {
    const FS = require('fs-extra')
    const path = require('path')

    const resultList: string[] = []
    const targetDir = path.resolve(bal.src)
    const parentDir = findRepoRoot()

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
    } catch {
        // Ignore read errors
    }

    if (ste) {
        ste.hunt(ActCns.UPDATE_CONSOLE, {
            idx: 'cns00',
            src: `Listing units in ${bal.src}: found ${resultList.length}`,
        })
    }

    if (bal.slv != null) {
        bal.slv({ untBit: { idx: 'list-unit', lst: resultList, src: bal.idx } })
    }
    return cpy
}
