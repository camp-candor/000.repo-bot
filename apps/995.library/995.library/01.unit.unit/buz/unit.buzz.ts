import * as ActCns from '../../83.console.unit/console.action'

import type { UnitModel } from '../unit.model'
import type UnitBit from '../fce/unit.bit'
import type State from '../../99.core/state'

export const initUnit = (cpy: UnitModel, _bal: UnitBit, _ste: State) => {
    debugger
    return cpy
}

export const flattenUnit = async (cpy: UnitModel, bal: UnitBit, ste: State) => {
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
                if (IGNORED_DIRS.has(entry.name)) {
                    continue
                }
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
    const doT = require('dot')
    const _S = require('string')

    const title = '00.' + bal.idx

    const loc = './data/redux/00.sim.unit/'

    //cpy effect redux data in project data
    FS.copySync('./data/00.sim.unit', './data/redux/00.sim.unit')

    const num = title.split('.')[0]
    let nom = title.split('.')[1]

    ste.hunt(ActCns.UPDATE_CONSOLE, { idx: 'cns00', src: 'nom ' + nom })

    const file = loc
    const list = FS.readdirSync(file)

    const out = []
    list.forEach((a, b) => {
        list[b] = file + '/' + a

        if (FS.lstatSync(list[b]).isDirectory()) {
            const directory = list[b]
            const listB = FS.readdirSync(directory)
            listB.forEach((c) => out.push(directory + '/' + c))
        } else {
            out.push(list[b])
        }
    })

    if (nom == null) nom = 'beeing'

    function capitalizeFirstLetter(string) {
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

    out.forEach((a) => {
        let neo = a.replace('sim', gel.nom)
        neo = neo.replace('.sim', '.' + gel.nom)

        //console.log("neo " + neo);

        const lineList = FS.readFileSync(a).toString().split('\n')

        lineList.forEach((a, b) => {
            //console.log("line " + a);
            const doTCompiled = doT.template(a)
            const outLine = doTCompiled(gel)
            lineList[b] = outLine
        })

        lineList.forEach((a) => {
            //console.log("line : " + a);
        })

        let finFin = neo.replace('sim', gel.nom)
        //console.log("what you got for a fin fin " + finFin);

        finFin = finFin.replace('../data/redux/', '../data/redux/unit/')

        finFin = finFin.replace('00', num)

        finFin = finFin.replace('.txt', '.ts')

        const finFile = lineList.join('\n')

        FS.ensureFileSync(finFin)
        FS.writeFileSync(finFin, finFile)

        ste.hunt(ActCns.UPDATE_CONSOLE, {
            idx: 'cns00',
            src: 'writing ' + finFin,
        })
    })

    setTimeout(() => {
        if (bal.slv != null)
            bal.slv({ untBit: { idx: 'create-unit', dat: { idx: bal.idx } } })
    }, 2111)

    return cpy
}

export const containUnit = (cpy: UnitModel, bal: UnitBit, ste: State) => {
    const fs = require('fs')
    const path = require('path')

    const resultList = []
    // Use process.cwd() to restrict scanning to the current repository (995.library)
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

    function scanForUnits(dir, depth = 0) {
        if (depth > 3) return false // Limit depth to prevent freezes
        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true })
            for (const entry of entries) {
                if (!entry.isDirectory()) continue
                if (IGNORE.has(entry.name)) continue

                if (/^\d{2}\..+\.unit$/.test(entry.name)) return true
                if (scanForUnits(path.join(dir, entry.name), depth + 1))
                    return true
            }
        } catch (e) {
            // Ignore directory read errors
        }
        return false
    }

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
            ste.hunt(ActCns.UPDATE_CONSOLE, {
                idx: 'cns00',
                src: 'Scanning project: ' + entry.name,
            })

            if (scanForUnits(projectPath)) {
                findPivots(projectPath, resultList)
            }
        }
    } catch (err) {
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

    let bit

    // Extract the unit name from the full path (e.g., '../../000.example/000.example/01.tick.unit' -> '01.tick.unit')
    const unitBasename = path.basename(bal.idx)
    const root = unitBasename.split('.')[1] || ''

    if (!root) {
        ste.hunt(ActCns.UPDATE_CONSOLE, {
            idx: 'cns00',
            src: `ERROR: Could not extract root from ${bal.idx}`,
        })
        if (bal.slv != null)
            bal.slv({
                untBit: {
                    idx: 'update-unit-error',
                    src: `Invalid unit path: ${bal.idx}`,
                },
            })
        return
    }

    const rootUpper = root.charAt(0).toUpperCase() + root.slice(1)
    const nom = bal.dat
    const nomUpper = nom.charAt(0).toUpperCase() + nom.slice(1)

    ste.hunt(ActCns.UPDATE_CONSOLE, {
        idx: 'cns00',
        src: `Target unit: ${root} (${rootUpper}) in ${unitBasename}`,
    })

    const buzzFile = path.resolve(bal.src, bal.idx, 'buz', root + '.buzz.ts')
    const buzzerFile = path.resolve(bal.src, bal.idx, root + '.buzzer.ts')
    const actionFile = path.resolve(bal.src, bal.idx, root + '.action.ts')
    const reduceFile = path.resolve(bal.src, bal.idx, root + '.reduce.ts')

    ste.hunt(ActCns.UPDATE_CONSOLE, {
        idx: 'cns00',
        src: `Updating unit paths: ${buzzFile}`,
    })

    const existBuzz = FS.existsSync(buzzFile)
    const existBuzzer = FS.existsSync(buzzerFile)
    const existAction = FS.existsSync(actionFile)
    const existReduce = FS.existsSync(reduceFile)

    if (
        existBuzz == false ||
        existAction == false ||
        existReduce == false ||
        existBuzzer == false
    ) {
        if (bal.slv != null)
            bal.slv({
                untBit: {
                    idx: 'update-unit-error',
                    src: 'no exist on source file',
                },
            })
        return
    }
    const listBuzz = FS.readFileSync(buzzFile).toString().split('\n')
    const listBuzzer = FS.readFileSync(buzzerFile).toString().split('\n')
    const listAction = FS.readFileSync(actionFile).toString().split('\n')
    const listReduce = FS.readFileSync(reduceFile).toString().split('\n')
    const doT = require('dot')
    const updateBuzz = (lst: string[]) => {
        const out = []

        const buzNom = nom + rootUpper
        const cpyNom = rootUpper + 'Model'
        const balNom = rootUpper + 'Bit'
        const lineList = cpy.buzzTemplate.toString().split('\n')
        const gel = { buzNom, cpyNom, balNom }

        out.push('')

        lineList.forEach((a) => {
            const doTCompiled = doT.template(a)
            const outLine = doTCompiled(gel)
            out.push(outLine)
        })

        const result = lst.concat(out)

        return { lst: result }
    }
    const updateActionUpper = (lst) => {
        const out = []
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
        lineList.forEach((a, _b) => {
            const doTCompiled = doT.template(a)
            const outLine = doTCompiled(gel)
            out.push(outLine)
        })
        return { lst: out, val: dex }
    }
    const updateActionLower = (lst) => {
        const out = []
        let dex = 0
        lst.forEach((a, b) => {
            if (a.includes('export type Actions =') == true) dex = b
        })
        const actTle = nomUpper + rootUpper
        const lineList = cpy.actTemplateLower.toString().split('\n')
        const gel = { actTle }
        lineList.forEach((a, _b) => {
            const doTCompiled = doT.template(a)
            const outLine = doTCompiled(gel)
            out.push(outLine)
        })
        return { lst: out, val: dex }
    }
    const updateReduce = (lst) => {
        const out = []
        let dex = 0
        lst.forEach((a, b) => {
            if (a.includes('default') == true) dex = b
        })
        let actUpr = nom + '_' + rootUpper
        actUpr = actUpr.toUpperCase()
        const actTle = nom + rootUpper
        const lineList = cpy.reduceTemplate.toString().split('\n')
        const gel = { actUpr, actTle }
        lineList.forEach((a, _b) => {
            const doTCompiled = doT.template(a)
            const outLine = doTCompiled(gel)
            out.push(outLine)
        })
        return { lst: out, val: dex }
    }
    const updateBuzzer = (lst) => {
        const out = []
        const actTle = nom + rootUpper
        const lineList = cpy.buzzerTemplate.toString().split('\n')
        const gel = { actTle, root }
        lineList.forEach((a, _b) => {
            const doTCompiled = doT.template(a)
            const outLine = doTCompiled(gel)
            lst.push(outLine)
        })
        return { lst }
    }
    const buzzBit = updateBuzz(listBuzz)
    const buzzerBit = updateBuzzer(listBuzzer)
    const actionUpperBit = updateActionUpper(listAction)
    const actionLowerBit = updateActionLower(listAction)
    const reduceBit = updateReduce(listReduce)
    // merge 'b' with 'a' at index 'i'
    const merge = (a, b, i = 0) => {
        return a.slice(0, i).concat(b, a.slice(i))
    }
    const resultBuzz = buzzBit.lst
    const resultBuzzer = buzzerBit.lst.filter((e) => {
        return e.length > 2
    })
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
    lowerActionList = lowerActionList.filter((e) => {
        if (e.length >= 2) return e
    })
    lowerActionList.push('| ' + nomUpper + rootUpper)
    lowerActionList.unshift(' ')
    resultActionUpper = resultActionUpper.slice(0, upperActionDex)
    const resultAction = resultActionUpper.concat(lowerActionList)

    buzzFile

    bit = await FS.writeFile(buzzFile, resultBuzz.join('\n'))

    ste.hunt(ActCns.UPDATE_CONSOLE, {
        idx: 'cns00',
        src: 'writing...' + buzzFile,
    })
    bit = await FS.writeFile(buzzerFile, resultBuzzer.join('\n'))

    ste.hunt(ActCns.UPDATE_CONSOLE, {
        idx: 'cns00',
        src: 'writing...' + buzzerFile,
    })
    bit = await FS.writeFile(reduceFile, resultReduce.join('\n'))
    ste.hunt(ActCns.UPDATE_CONSOLE, {
        idx: 'cns00',
        src: 'writing...' + reduceFile,
    })

    bit = await FS.writeFile(actionFile, resultAction.join('\n'))
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

    const resultList = []
    const targetDir = path.resolve(bal.src)
    const parentDir = process.cwd()

    try {
        if (FS.existsSync(targetDir)) {
            const entries = FS.readdirSync(targetDir, { withFileTypes: true })

            for (const entry of entries) {
                if (!entry.isDirectory()) continue
                // Match 00.example.unit pattern
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
    } catch (err) {
        console.error(`Error in listUnit: ${err.message}`)
    }

    ste.hunt(ActCns.UPDATE_CONSOLE, {
        idx: 'cns00',
        src: `Listing units in ${bal.src}: found ${resultList.length}`,
    })

    resultList

    bal.slv({ untBit: { idx: 'list-unit', lst: resultList, src: bal.idx } })
    return cpy
}
