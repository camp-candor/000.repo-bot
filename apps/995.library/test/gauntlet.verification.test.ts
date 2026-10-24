import test from 'ava'
import fs from 'fs'
import path from 'path'
import sinon from 'sinon'
import { fileURLToPath } from 'url'
import { GridModel } from '../995.library/81.grid.unit/grid.model'
import { updateGrid } from '../995.library/81.grid.unit/buz/grid.buzz'
import { InputModel } from '../995.library/84.input.unit/input.model'
import { openInput } from '../995.library/84.input.unit/buz/input.buzz'


const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const rootLibraryDir = path.resolve(__dirname, '../995.library')

// ==============================================================================
// TIER 1: PHASE 1 BIT CONTRACTS & GENERIC INTERFACE CERTIFICATION
// ==============================================================================

test('Phase 1 Certification -- fce/*.bit.ts interfaces declare generics and typed slv', (t) => {
    const bitFiles = [
        '00.library.unit/fce/library.bit.ts',
        '01.unit.unit/fce/unit.bit.ts',
        '80.terminal.unit/fce/terminal.bit.ts',
        '81.grid.unit/fce/grid.bit.ts',
        '83.console.unit/fce/console.bit.ts',
        '84.input.unit/fce/input.bit.ts',
        '85.choice.unit/fce/choice.bit.ts',
        '98.menu.unit/fce/menu.bit.ts',
    ]

    for (const relFile of bitFiles) {
        const fullPath = path.join(rootLibraryDir, relFile)
        t.true(fs.existsSync(fullPath), `Target bit interface must exist: ${relFile}`)

        const content = fs.readFileSync(fullPath, 'utf8')

        // Assert no untyped Function callback remains
        t.false(
            content.includes('slv?: Function'),
            `Interface ${relFile} must not retain unconstrained 'slv?: Function'`
        )

        // Assert slv has a typed signature returning a partial bit object
        t.regex(
            content,
            /slv\?:\s*\(\s*result:\s*\{\s*\w+Bit:/,
            `Interface ${relFile} must define a strongly typed slv callback signature`
        )
    }
})

test('Phase 1 Certification -- ChoiceBit types styling attributes and selection callback', (t) => {
    const choiceBitPath = path.join(rootLibraryDir, '85.choice.unit/fce/choice.bit.ts')
    const content = fs.readFileSync(choiceBitPath, 'utf8')

    t.true(content.includes('cb?: (choice: string) => void'))
    t.true(content.includes('clr0?: string'))
    t.true(content.includes('clr1?: string'))
})

// ==============================================================================
// TIER 2: PHASE 2 ACTION BINDINGS & REDUCER HARDENING CERTIFICATION
// ==============================================================================

test('Phase 2 Certification -- Action classes implement Action<TBit>', (t) => {
    const actionFiles = [
        { file: '80.terminal.unit/terminal.action.ts', bit: 'TerminalBit' },
        { file: '81.grid.unit/grid.action.ts', bit: 'GridBit' },
        { file: '83.console.unit/console.action.ts', bit: 'ConsoleBit' },
        { file: '84.input.unit/input.action.ts', bit: 'InputBit' },
        { file: '85.choice.unit/choice.action.ts', bit: 'ChoiceBit' },
        { file: '00.library.unit/library.action.ts', bit: 'LibraryBit' },
        { file: '01.unit.unit/unit.action.ts', bit: 'UnitBit' },
    ]

    for (const item of actionFiles) {
        const fullPath = path.join(rootLibraryDir, item.file)
        t.true(fs.existsSync(fullPath), `Action file must exist: ${item.file}`)
        const content = fs.readFileSync(fullPath, 'utf8')

        t.regex(
            content,
            new RegExp(`class \\w+ implements Action<${item.bit}`),
            `Action classes in ${item.file} must explicitly implement Action<${item.bit}>`
        )
    }
})

test('Phase 2 Certification -- Unit reducers wrap state in clone(model) and pass default', (t) => {
    const units = [
        '80.terminal',
        '81.grid',
        '83.console',
        '84.input',
        '85.choice',
        '00.library',
        '01.unit',
        '98.menu',
    ]

    for (const u of units) {
        const file = path.join(rootLibraryDir, `${u}.unit/${u.split('.')[1]}.reduce.ts`)
        t.true(fs.existsSync(file), `Reducer file must exist: ${file}`)
        const content = fs.readFileSync(file, 'utf8')

        t.true(
            content.includes('clone(model, true)'),
            `Reducer ${file} must wrap model in clone(model, true) before buzzer delegation`
        )

        t.regex(
            content,
            /default:\s*return model/,
            `Reducer ${file} must include default passthrough branch returning model`
        )
    }
})

// ==============================================================================
// TIER 3: PHASE 3 BUZZER CLEANUP & RUNTIME DEFENSE CERTIFICATION
// ==============================================================================

test('Phase 3 Certification -- Absolute eradication of debugger; statements', (t) => {
    const buzDirs = [
        '80.terminal.unit/buz',
        '81.grid.unit/buz',
        '83.console.unit/buz',
        '84.input.unit/buz',
        '98.menu.unit/buz',
    ]

    for (const bDir of buzDirs) {
        const fullDir = path.join(rootLibraryDir, bDir)
        const files = fs.readdirSync(fullDir).filter((f) => f.endsWith('.ts'))

        for (const f of files) {
            const content = fs.readFileSync(path.join(fullDir, f), 'utf8')
            t.false(
                content.includes('debugger;'),
                `Buzzer file ${bDir}/${f} must not contain debugger; breakpoints`
            )
        }
    }
})

test('Phase 3 Certification -- menu.library.ts contains deduplicated switch cases', (t) => {
    const menuLibraryPath = path.join(rootLibraryDir, '98.menu.unit/buz/menu.library.ts')
    const content = fs.readFileSync(menuLibraryPath, 'utf8')

    const createUnitCases = (content.match(/case ActUnt\.CREATE_UNIT\.split/g) || []).length
    t.is(
        createUnitCases,
        1,
        'menu.library.ts must contain exactly one switch case for ActUnt.CREATE_UNIT'
    )
})

test('Phase 3 Certification -- Grid math handles undefined parameters defensively', async (t) => {



    const model = new GridModel()
    let resultNet: any = null
    const bal = {
        slv: (res: any) => {
            resultNet = res.grdBit.dat
        },
    } as any

    updateGrid(model, bal, null as any)

    t.truthy(resultNet, 'updateGrid must resolve bal.slv')
    t.false(resultNet.left.includes('NaN'), 'Left coordinate must not be NaN')
    t.false(resultNet.top.includes('NaN'), 'Top coordinate must not be NaN')
    t.false(resultNet.width.includes('NaN'), 'Width coordinate must not be NaN')
    t.false(resultNet.height.includes('NaN'), 'Height coordinate must not be NaN')
    t.is(resultNet.width, '100%')
    t.is(resultNet.height, '100%')
})

test('Phase 3 Certification -- Headless forms resolve safely without curses screen', async (t) => {



    const model = new InputModel()
    let resolvedIdx = ''
    const bal = {
        src: 'sample',
        slv: (res: any) => {
            resolvedIdx = res.putBit.idx
        },
    } as any
    const ste = { value: { terminal: { screen: null, blessed: null } } } as any

    openInput(model, bal, ste)
    t.is(resolvedIdx, 'open-input-headless')
})

// ==============================================================================
// TIER 4: EMISSION CONTROL & 7-BIT PURE ASCII SENTINEL
// ==============================================================================

test('Tier 4 Certification -- Zero multi-byte UTF-8 emojis across codebase', (t) => {
    const checkDirs = [
        path.join(rootLibraryDir, '80.terminal.unit'),
        path.join(rootLibraryDir, '81.grid.unit'),
        path.join(rootLibraryDir, '83.console.unit'),
        path.join(rootLibraryDir, '84.input.unit'),
        path.join(rootLibraryDir, '85.choice.unit'),
        path.join(rootLibraryDir, '98.menu.unit'),
        path.join(rootLibraryDir, '00.library.unit'),
        path.join(rootLibraryDir, '01.unit.unit'),
    ]

    const emojiRegex = /[\uD83C-\uDBFF\uDC00-\uDFFF]+/

    function walkDir(dir: string): string[] {
        const results: string[] = []
        const list = fs.readdirSync(dir)
        for (const item of list) {
            const itemPath = path.join(dir, item)
            const stat = fs.statSync(itemPath)
            if (stat.isDirectory()) {
                results.push(...walkDir(itemPath))
            } else if (itemPath.endsWith('.ts')) {
                results.push(itemPath)
            }
        }
        return results
    }

    for (const d of checkDirs) {
        const files = walkDir(d)
        for (const f of files) {
            const content = fs.readFileSync(f, 'utf8')
            t.false(
                emojiRegex.test(content),
                `File ${f} must not contain multi-byte UTF-8 emojis`
            )
        }
    }
})

test('Tier 4 Certification -- Zero leaked compiled artifacts (.js, .d.ts) in source trees', (t) => {
    function findLeakedArtifacts(dir: string): string[] {
        const results: string[] = []
        const list = fs.readdirSync(dir)
        for (const item of list) {
            const itemPath = path.join(dir, item)
            const stat = fs.statSync(itemPath)
            if (stat.isDirectory()) {
                if (item !== 'node_modules' && item !== 'dist') {
                    results.push(...findLeakedArtifacts(itemPath))
                }
            } else if (item.endsWith('.js') || item.endsWith('.d.ts')) {
                results.push(itemPath)
            }
        }
        return results
    }

    const leaked = findLeakedArtifacts(rootLibraryDir)
    t.deepEqual(leaked, [], 'Source tree must contain zero side-by-side compiled JS or declaration files')
})
