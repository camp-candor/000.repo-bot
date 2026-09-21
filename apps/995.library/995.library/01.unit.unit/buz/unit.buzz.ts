import * as ActCns from '../../83.console.unit/console.action'

import type { UnitModel } from '../unit.model'
import type UnitBit from '../fce/unit.bit'
import type State from '../../99.core/state'

export const initUnit = (cpy: UnitModel, _bal: UnitBit, _ste: State) => {
    debugger
    return cpy
}

export const flattenUnit = (cpy: UnitModel, bal: UnitBit, _ste: State) => {
    const fs = require('fs-extra')
    const path = require('path')

    // CONFIGURATION
    const SOURCE_DIR = bal.src // The directory to scan
    const OUTPUT_FILE = './data/unit/' + bal.idx + '.ts' // Where to save the single file

    /**
     * Recursively gets all files in a directory
     */
    async function getFilePaths(dir) {
        const files = await fs.readdir(dir)

        // Resolve all files to absolute paths or paths relative to execution
        const filePaths = files.map((file) => path.join(dir, file))

        // Map over paths: if directory -> recurse, if file -> return path
        const statPromises = filePaths.map(async (filePath) => {
            const stat = await fs.stat(filePath)
            if (stat.isDirectory()) {
                return getFilePaths(filePath)
            } else {
                return filePath
            }
        })

        // Wait for all recursions to finish and flatten the arrays
        return (await Promise.all(statPromises)).flat()
    }

    /**
     * Main execution function
     */
    async function combineTsFiles() {
        try {
            console.log(`Scanning directory: ${SOURCE_DIR}...`)

            // 1. Get all files recursively
            const allFiles = await getFilePaths(SOURCE_DIR)

            // 2. Filter for only .ts files
            const tsFiles = allFiles.filter(
                (file) => path.extname(file) === '.ts',
            )

            console.log(`Found ${tsFiles.length} TS files.`)

            // 3. Read content of all files
            const fileContents = await Promise.all(
                tsFiles.map(async (file) => {
                    const content = await fs.readFile(file, 'utf8')
                    // Optional: Add a header so you know which file this code came from
                    return `// ----- SOURCE: ${file} -----\n${content}`
                }),
            )

            // 4. Combine into a single string
            const combinedData = fileContents.join('\n\n')

            // 5. Write to disk
            // fs.outputFile is an fs-extra specific method.
            // It automatically creates the parent directories if they don't exist.
            await fs.outputFile(OUTPUT_FILE, combinedData)

            console.log(`Successfully wrote combined file to: ${OUTPUT_FILE}`)

            bal.slv({ untBit: { idx: 'flatten-unit', val: 0 } })
        } catch (err) {
            console.error('Error combining files:', err)
        }
    }

    // Run the script
    combineTsFiles()

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
