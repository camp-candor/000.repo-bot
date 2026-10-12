import * as ActDat from '../../03.data.unit/data.action'
import * as ActDrt from '../../06.directive.unit/directive.action'
/* eslint-disable */
import { MenuModel } from '../menu.model'
import MenuBit from '../fce/menu.bit'
import State from '../../99.core/state'

import * as ActLib from '../../00.library.unit/library.action'
import * as ActUnt from '../../01.unit.unit/unit.action'
import * as ActAct from '../../02.action.unit/action.action'
import * as ActPkg from '../../05.package.unit/package.action'

import * as Grid from '../../val/grid'
import * as Align from '../../val/align'
import * as Color from '../../val/console-color'

import * as SHAPE from '../../val/shape'
import * as FOCUS from '../../val/focus'

import * as ActMnu from '../menu.action'

import * as ActTrm from '../../80.terminal.unit/terminal.action'
import * as ActChc from '../../85.choice.unit/choice.action'
import * as ActPut from '../../84.input.unit/input.action'

import * as ActGrd from '../../81.grid.unit/grid.action'
import * as ActCns from '../../83.console.unit/console.action'

import * as ActTrn from '../../act/turn.action'
import * as ActClr from '../../act/color.action'
import * as ActSow from '../../act/sower.action'

import * as PVT from '../../val/pivot'

const FS = require('fs-extra')
const path = require('path')

let bit: any, lst: any, dex: any, idx: any, dat: any, src: any

export const libraryMenu = async (cpy: MenuModel, bal: MenuBit, ste: State) => {
    if (!ste) {
        if (bal?.slv) bal.slv({ mnuBit: { idx: 'library-menu-headless' } })
        return cpy
    }

    bit = await ste.hunt(ActTrm.CLEAR_TERMINAL, {})

    bit = await ste.hunt(ActCns.UPDATE_CONSOLE, {
        idx: 'cns00',
        src: 'LIBRARY MENU',
    })
    bit = await ste.hunt(ActCns.UPDATE_CONSOLE, {
        idx: 'cns00',
        src: '-----------',
    })

    lst = [
        ActUnt.UPDATE_UNIT.split(']')[1],
        ActAct.UPDATE_ACTION.split(']')[1],
        ActUnt.CREATE_UNIT.split(']')[1],
        ActPkg.CREATE_PACKAGE.split(']')[1],
        ActDrt.DAY_DIRECTIVE.split(']')[1],
        ActDrt.CREATE_DIRECTIVE.split(']')[1],
        ActDrt.PHASE_DIRECTIVE.split(']')[1],
        ActDat.FLAT_DATA.split(']')[1],
        ActUnt.FLATTEN_UNIT.split(']')[1],
        ActLib.FLAT_LIBRARY.split(']')[1],
        ActLib.PROGRESS_LIBRARY.split(']')[1],
        ActLib.UPDATE_LIBRARY.split(']')[1],
        ActLib.LIST_LIBRARY.split(']')[1],
        ActLib.AUDIT_LIBRARY.split(']')[1],
        ActLib.LAUNCH_LIBRARY.split(']')[1],
        'ROOT MENU',
    ]

    const descriptions: Record<string, string> = {
        [ActUnt.UPDATE_UNIT.split(']')[1]]:
            '-Update an existing unit\nin the library.',
        [ActAct.UPDATE_ACTION.split(']')[1]]:
            '-Update an action for\na specific unit \nso the library can use the action',
        [ActUnt.CREATE_UNIT.split(']')[1]]:
            '-Create a new unit\nwith a specified verb.',
        [ActPkg.CREATE_PACKAGE.split(']')[1]]:
            '-Scaffold a new package\ninto data/package.',
        [ActDrt.DAY_DIRECTIVE.split(']')[1]]:
            '-Provision the next sequential\nday directive in data/directive.',
        [ActDrt.CREATE_DIRECTIVE.split(']')[1]]:
            '-Scaffold focus divider and\npaired phase directives.',
        [ActDrt.PHASE_DIRECTIVE.split(']')[1]]:
            '-Increment and append the next\nphase pair to a chosen day.',
        [ActDat.FLAT_DATA.split(']')[1]]:
            '-Consolidate files in data/flatten\ninto a single file in data/flat.',
        [ActUnt.FLATTEN_UNIT.split(']')[1]]:
            '-Flatten a unit into\nits constituent files.',
        [ActLib.FLAT_LIBRARY.split(']')[1]]:
            '-Flatten library code\ninto data/flat.',
        [ActLib.PROGRESS_LIBRARY.split(']')[1]]:
            '-Synchronize 995.library across\nsibling repositories.',
        [ActLib.UPDATE_LIBRARY.split(']')[1]]:
            '-Regenerate the library\nwiring manifest (BEE.ts).',
        [ActLib.LIST_LIBRARY.split(']')[1]]:
            '-List all the units\ncurrently in the library.',
        [ActLib.AUDIT_LIBRARY.split(']')[1]]:
            '-Compare fleet repositories against\nthe Central Coordination Manifest.',
        [ActLib.LAUNCH_LIBRARY.split(']')[1]]: '-Launch library urls.',
        'ROOT MENU': '-Return to the root menu.',
    }

    bit = await ste.hunt(ActGrd.UPDATE_GRID, {
        x: 0,
        y: 4,
        xSpan: 4,
        ySpan: 12,
    })
    bit = await ste.hunt(ActChc.OPEN_CHOICE, {
        dat: {
            clr0: Color.BLACK,
            clr1: Color.YELLOW,
            cb: (choice: string) => {
                const text = descriptions[choice] || 'No description available.'
                text.split('\n').forEach((s: string) =>
                    ste.hunt(ActCns.UPDATE_CONSOLE, {
                        idx: 'cns00',
                        src: s,
                    }),
                )
            },
        },
        src: Align.VERTICAL,
        lst,
        net: bit.grdBit.dat,
    })
    src = bit?.chcBit?.src

    switch (src) {
        case ActDrt.CREATE_DIRECTIVE.split(']')[1]: {
            await ste.hunt(ActTrm.CLEAR_TERMINAL, {})

            const FS = require('fs')
            const path = require('path')
            let parentDir = process.cwd()
            while (
                parentDir &&
                !(
                    FS.existsSync(path.join(parentDir, 'apps')) &&
                    FS.existsSync(path.join(parentDir, 'packages')) &&
                    FS.existsSync(path.join(parentDir, 'package.json'))
                )
            ) {
                const parent = path.dirname(parentDir)
                if (parent === parentDir) break
                parentDir = parent
            }

            const directiveRootDir = path.join(parentDir, 'data', 'directive')
            let dayDirs: string[] = []

            if (FS.existsSync(directiveRootDir)) {
                const entries = FS.readdirSync(directiveRootDir, {
                    withFileTypes: true,
                })
                dayDirs = entries
                    .filter(
                        (e: any) => e.isDirectory() && /^day-\d+/i.test(e.name),
                    )
                    .map((e: any) => e.name)
                    .sort((a: string, b: string) =>
                        b.localeCompare(a, undefined, { numeric: true }),
                    )
            }

            if (dayDirs.length === 0) {
                await ste.hunt(ActCns.UPDATE_CONSOLE, {
                    idx: 'cns00',
                    src: '>> [NOTICE] No day directories found in data/directive/. Run Day Directive first.',
                })
                break
            }

            // Step 1: Select Day Directory Modal
            bit = await ste.hunt(ActGrd.UPDATE_GRID, {
                x: 0,
                y: 4,
                xSpan: 4,
                ySpan: 12,
            })
            bit = await ste.hunt(ActChc.OPEN_CHOICE, {
                dat: { clr0: Color.BLACK, clr1: Color.YELLOW },
                src: Align.VERTICAL,
                lst: dayDirs,
                net: bit.grdBit.dat,
            })
            const selectedDay = bit?.chcBit?.src
            if (!selectedDay) break

            await ste.hunt(ActTrm.CLEAR_TERMINAL, {})

            // Step 2: Input Focus Divider Label Modal
            bit = await ste.hunt(ActGrd.UPDATE_GRID, {
                x: 0,
                y: 4,
                xSpan: 4,
                ySpan: 6,
            })
            bit = await ste.hunt(ActPut.OPEN_INPUT, {
                dat: { clr0: Color.BLACK, clr1: Color.YELLOW },
                src: Align.VERTICAL,
                lst,
                txt: 'input focus label (e.g. modernize-media-pipeline)',
                net: bit.grdBit.dat,
            })
            const rawLabelInput = (bit?.putBit?.src || '').trim()
            if (!rawLabelInput) break

            await ste.hunt(ActTrm.CLEAR_TERMINAL, {})

            // Step 3: Select Number of Phases Modal
            const phaseOptions = [
                '1 Phase',
                '2 Phases',
                '3 Phases',
                '4 Phases',
                '5 Phases',
                'Custom',
            ]
            bit = await ste.hunt(ActGrd.UPDATE_GRID, {
                x: 0,
                y: 4,
                xSpan: 4,
                ySpan: 8,
            })
            bit = await ste.hunt(ActChc.OPEN_CHOICE, {
                dat: { clr0: Color.BLACK, clr1: Color.YELLOW },
                src: Align.VERTICAL,
                lst: phaseOptions,
                net: bit.grdBit.dat,
            })
            const phaseSelection = bit?.chcBit?.src
            if (!phaseSelection) break

            let finalPhaseCount = 1

            if (phaseSelection === 'Custom') {
                await ste.hunt(ActTrm.CLEAR_TERMINAL, {})
                bit = await ste.hunt(ActGrd.UPDATE_GRID, {
                    x: 0,
                    y: 4,
                    xSpan: 4,
                    ySpan: 6,
                })
                bit = await ste.hunt(ActPut.OPEN_INPUT, {
                    dat: { clr0: Color.BLACK, clr1: Color.YELLOW },
                    src: Align.VERTICAL,
                    lst,
                    txt: 'input number of phases (integer)',
                    net: bit.grdBit.dat,
                })
                const customInt = parseInt(bit?.putBit?.src || '1', 10)
                finalPhaseCount =
                    isNaN(customInt) || customInt < 1 ? 1 : customInt
            } else {
                finalPhaseCount =
                    parseInt(phaseSelection.split(' ')[0], 10) || 1
            }

            await ste.hunt(ActTrm.CLEAR_TERMINAL, {})

            // Step 4: Dispatch CREATE_DIRECTIVE
            const createRes = await ste.hunt(ActDrt.CREATE_DIRECTIVE, {
                src: selectedDay,
                idx: rawLabelInput,
                val: finalPhaseCount,
            })

            await ste.hunt(ActTrm.CLEAR_TERMINAL, {})
            bit = await ste.hunt(ActMnu.PRINT_MENU, createRes)
            break
        }

        case ActDrt.DAY_DIRECTIVE.split(']')[1]: {
            await ste.hunt(ActTrm.CLEAR_TERMINAL, {})
            bit = await ste.hunt(ActDrt.DAY_DIRECTIVE, {})
            await ste.hunt(ActTrm.CLEAR_TERMINAL, {})
            bit = await ste.hunt(ActMnu.PRINT_MENU, bit)
            break
        }
        case ActLib.LAUNCH_LIBRARY.split(']')[1]: {
            bit = await ste.hunt(ActLib.LAUNCH_LIBRARY, {})
            break
        }

        case ActAct.UPDATE_ACTION.split(']')[1]: {
            await ste.hunt(ActTrm.CLEAR_TERMINAL, {})
            bit = await ste.hunt(ActLib.LIST_LIBRARY, {})
            lst = bit.libBit.lst

            bit = await ste.hunt(ActGrd.UPDATE_GRID, {
                x: 0,
                y: 4,
                xSpan: 4,
                ySpan: 12,
            })
            bit = await ste.hunt(ActChc.OPEN_CHOICE, {
                dat: { clr0: Color.BLACK, clr1: Color.YELLOW },
                src: Align.VERTICAL,
                lst,
                net: bit.grdBit.dat,
            })
            src = bit.chcBit.src

            await ste.hunt(ActTrm.CLEAR_TERMINAL, {})
            bit = await ste.hunt(ActUnt.LIST_UNIT, { src })
            lst = bit.untBit.lst

            bit = await ste.hunt(ActGrd.UPDATE_GRID, {
                x: 0,
                y: 4,
                xSpan: 4,
                ySpan: 12,
            })
            bit = await ste.hunt(ActChc.OPEN_CHOICE, {
                dat: { clr0: Color.BLACK, clr1: Color.YELLOW },
                src: Align.VERTICAL,
                lst,
                net: bit.grdBit.dat,
            })
            idx = bit.chcBit.src

            const updateActionBit = await ste.hunt(ActAct.UPDATE_ACTION, {
                idx,
                src,
            })
            await ste.hunt(ActTrm.CLEAR_TERMINAL, {})
            break
        }

        case ActUnt.CREATE_UNIT.split(']')[1]: {
            await ste.hunt(ActTrm.CLEAR_TERMINAL, {})
            bit = await ste.hunt(ActGrd.UPDATE_GRID, {
                x: 0,
                y: 4,
                xSpan: 4,
                ySpan: 6,
            })
            bit = await ste.hunt(ActPut.OPEN_INPUT, {
                dat: { clr0: Color.BLACK, clr1: Color.YELLOW },
                src: Align.VERTICAL,
                lst,
                txt: 'input verb',
                net: bit.grdBit.dat,
            })
            idx = bit.putBit.src

            const createUnitBit = await ste.hunt(ActUnt.CREATE_UNIT, { idx })
            await ste.hunt(ActTrm.CLEAR_TERMINAL, {})
            bit = await ste.hunt(ActMnu.PRINT_MENU, createUnitBit)
            break
        }

        case ActPkg.CREATE_PACKAGE.split(']')[1]: {
            await ste.hunt(ActTrm.CLEAR_TERMINAL, {})
            bit = await ste.hunt(ActGrd.UPDATE_GRID, {
                x: 0,
                y: 4,
                xSpan: 4,
                ySpan: 6,
            })
            bit = await ste.hunt(ActPut.OPEN_INPUT, {
                dat: { clr0: Color.BLACK, clr1: Color.YELLOW },
                src: Align.VERTICAL,
                lst,
                txt: 'input package verb (e.g. 104.hotkey)',
                net: bit.grdBit.dat,
            })
            idx = bit?.putBit?.src

            if (idx) {
                const createPkgBit = await ste.hunt(ActPkg.CREATE_PACKAGE, {
                    idx,
                })
                await ste.hunt(ActTrm.CLEAR_TERMINAL, {})
                bit = await ste.hunt(ActMnu.PRINT_MENU, createPkgBit)
            } else {
                await ste.hunt(ActTrm.CLEAR_TERMINAL, {})
            }
            break
        }

        case ActUnt.UPDATE_UNIT.split(']')[1]: {
            await ste.hunt(ActTrm.CLEAR_TERMINAL, {})
            bit = await ste.hunt(ActUnt.CONTAIN_UNIT, { src })
            const fullPivotList = bit.untBit.lst
            const pivotList = fullPivotList.map((item: string) => {
                const clean = item.replace(/[[\]]/g, '')
                const parts = clean.split('/')
                return `[${parts[parts.length - 1]}]`
            })
            lst = pivotList

            let pivotSelection = ''
            dex = 0
            while (pivotSelection === '') {
                const items = pivotList.slice(dex, dex + 10)
                const list = [...items]
                if (pivotList.length > 10) list.push('MORE')

                bit = await ste.hunt(ActGrd.UPDATE_GRID, {
                    x: 0,
                    y: 4,
                    xSpan: 4,
                    ySpan: 12,
                })
                bit = await ste.hunt(ActChc.OPEN_CHOICE, {
                    dat: { clr0: Color.BLACK, clr1: Color.YELLOW },
                    src: Align.VERTICAL,
                    lst: list,
                    net: bit.grdBit.dat,
                })

                src = bit.chcBit.src
                if (src === 'MORE') {
                    dex = dex + 10 >= pivotList.length ? 0 : dex + 10
                    await ste.hunt(ActTrm.CLEAR_TERMINAL, {})
                } else {
                    const selectedIdx = pivotList.indexOf(src)
                    pivotSelection = fullPivotList[selectedIdx]
                }
            }

            await ste.hunt(ActTrm.CLEAR_TERMINAL, {})

            if (pivotSelection)
                pivotSelection = pivotSelection.replace(/[[\]]/g, '')

            let parentDir = process.cwd()
            while (
                parentDir &&
                !(
                    FS.existsSync(path.join(parentDir, 'apps')) &&
                    FS.existsSync(path.join(parentDir, 'packages')) &&
                    FS.existsSync(path.join(parentDir, 'package.json'))
                )
            ) {
                const parent = path.dirname(parentDir)
                if (parent === parentDir) break
                parentDir = parent
            }
            src = path.resolve(parentDir, pivotSelection)

            ste.hunt(ActCns.UPDATE_CONSOLE, {
                idx: 'cns00',
                src: `Resolving pivot: ${pivotSelection} -> ${src}`,
            })

            bit = await ste.hunt(ActUnt.LIST_UNIT, { src })
            const fullUnitList = bit.untBit.lst
            const unitList = fullUnitList.map((item: string) => {
                const parts = item.split('/')
                return parts[parts.length - 1]
            })

            let unitSelection = ''
            dex = 0
            while (unitSelection === '') {
                const items = unitList.slice(dex, dex + 10)
                const list = [...items]
                if (unitList.length > 10) list.push('MORE')

                bit = await ste.hunt(ActGrd.UPDATE_GRID, {
                    x: 0,
                    y: 4,
                    xSpan: 4,
                    ySpan: 12,
                })
                bit = await ste.hunt(ActChc.OPEN_CHOICE, {
                    dat: { clr0: Color.BLACK, clr1: Color.YELLOW },
                    src: Align.VERTICAL,
                    lst: list,
                    net: bit.grdBit.dat,
                })

                const res = bit.chcBit.src
                if (res === 'MORE') {
                    dex = dex + 10 >= unitList.length ? 0 : dex + 10
                    await ste.hunt(ActTrm.CLEAR_TERMINAL, {})
                } else {
                    const selectedIdx = unitList.indexOf(res)
                    idx = fullUnitList[selectedIdx]
                    unitSelection = res
                }
            }

            await ste.hunt(ActTrm.CLEAR_TERMINAL, {})

            bit = await ste.hunt(ActGrd.UPDATE_GRID, {
                x: 0,
                y: 4,
                xSpan: 4,
                ySpan: 2,
            })
            bit = await ste.hunt(ActPut.OPEN_INPUT, {
                dat: { clr0: Color.BLACK, clr1: Color.YELLOW },
                src: Align.VERTICAL,
                lst,
                txt: 'input verb',
                net: bit.grdBit.dat,
            })
            dat = bit.putBit.src

            const updateUnitBit = await ste.hunt(ActUnt.UPDATE_UNIT, {
                idx,
                src,
                dat,
            })
            await ste.hunt(ActTrm.CLEAR_TERMINAL, {})
            bit = await ste.hunt(ActMnu.PRINT_MENU, updateUnitBit)
            break
        }

        case ActDrt.PHASE_DIRECTIVE.split(']')[1]: {
            await ste.hunt(ActTrm.CLEAR_TERMINAL, {})

            let parentDir = process.cwd()
            while (
                parentDir &&
                !(
                    FS.existsSync(path.join(parentDir, 'apps')) &&
                    FS.existsSync(path.join(parentDir, 'packages')) &&
                    FS.existsSync(path.join(parentDir, 'package.json'))
                )
            ) {
                const parent = path.dirname(parentDir)
                if (parent === parentDir) break
                parentDir = parent
            }

            const directiveRootDir = path.join(parentDir, 'data', 'directive')
            let dayDirs: string[] = []

            if (FS.existsSync(directiveRootDir)) {
                const entries = FS.readdirSync(directiveRootDir, {
                    withFileTypes: true,
                })
                dayDirs = entries
                    .filter(
                        (e: any) => e.isDirectory() && /^day-\d+/i.test(e.name),
                    )
                    .map((e: any) => e.name)
                    .sort((a: string, b: string) =>
                        b.localeCompare(a, undefined, { numeric: true }),
                    )
            }

            if (dayDirs.length === 0) {
                await ste.hunt(ActCns.UPDATE_CONSOLE, {
                    idx: 'cns00',
                    src: '>> [NOTICE] No day directories found in data/directive/. Run Day Directive first.',
                })
                break
            }

            bit = await ste.hunt(ActGrd.UPDATE_GRID, {
                x: 0,
                y: 4,
                xSpan: 4,
                ySpan: Math.min(12, Math.max(6, dayDirs.length + 2)),
            })
            bit = await ste.hunt(ActChc.OPEN_CHOICE, {
                dat: { clr0: Color.BLACK, clr1: Color.YELLOW },
                src: Align.VERTICAL,
                lst: dayDirs,
                net: bit.grdBit.dat,
            })
            const selectedDay = bit?.chcBit?.src

            await ste.hunt(ActTrm.CLEAR_TERMINAL, {})

            if (selectedDay) {
                const phaseRes = await ste.hunt(ActDrt.PHASE_DIRECTIVE, {
                    src: selectedDay,
                })
                await ste.hunt(ActTrm.CLEAR_TERMINAL, {})
                bit = await ste.hunt(ActMnu.PRINT_MENU, phaseRes)
            }
            break
        }

        case ActDat.FLAT_DATA.split(']')[1]: {
            await ste.hunt(ActTrm.CLEAR_TERMINAL, {})

            let parentDir = process.cwd()
            while (
                parentDir &&
                !(
                    FS.existsSync(path.join(parentDir, 'apps')) &&
                    FS.existsSync(path.join(parentDir, 'packages')) &&
                    FS.existsSync(path.join(parentDir, 'package.json'))
                )
            ) {
                const parent = path.dirname(parentDir)
                if (parent === parentDir) break
                parentDir = parent
            }

            const flattenDir = path.join(parentDir, 'data', 'flatten')
            await FS.ensureDir(flattenDir)

            const entries = FS.readdirSync(flattenDir, { withFileTypes: true })
            const files = entries
                .filter((e: any) => e.isFile())
                .map((e: any) => e.name)
                .sort((a: string, b: string) => a.localeCompare(b))

            if (files.length === 0) {
                await ste.hunt(ActCns.UPDATE_CONSOLE, {
                    idx: 'cns00',
                    src: '>> [NOTICE] No files found in data/flatten to consolidate.',
                })
                break
            }

            bit = await ste.hunt(ActGrd.UPDATE_GRID, {
                x: 0,
                y: 4,
                xSpan: 4,
                ySpan: 12,
            })
            bit = await ste.hunt(ActChc.OPEN_CHOICE, {
                dat: { clr0: Color.BLACK, clr1: Color.YELLOW },
                src: Align.VERTICAL,
                lst: files,
                net: bit.grdBit.dat,
            })
            const selectedFileName = bit?.chcBit?.src

            await ste.hunt(ActTrm.CLEAR_TERMINAL, {})

            if (selectedFileName) {
                await ste.hunt(ActCns.UPDATE_CONSOLE, {
                    idx: 'cns00',
                    src: `>> [FLAT] Consolidating data/flatten into data/flat/${selectedFileName}...`,
                })

                const flatRes = await ste.hunt(ActDat.FLAT_DATA, {
                    src: selectedFileName,
                })

                await ste.hunt(ActTrm.CLEAR_TERMINAL, {})
                bit = await ste.hunt(ActMnu.PRINT_MENU, flatRes)
            } else {
                await ste.hunt(ActCns.UPDATE_CONSOLE, {
                    idx: 'cns00',
                    src: '>> [ABORT] File consolidation cancelled.',
                })
            }
            break
        }

        case ActUnt.FLATTEN_UNIT.split(']')[1]: {
            await ste.hunt(ActTrm.CLEAR_TERMINAL, {})
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

            lst = ['apps', 'packages']
            bit = await ste.hunt(ActGrd.UPDATE_GRID, {
                x: 0,
                y: 4,
                xSpan: 4,
                ySpan: 12,
            })
            bit = await ste.hunt(ActChc.OPEN_CHOICE, {
                dat: { clr0: Color.BLACK, clr1: Color.YELLOW },
                src: Align.VERTICAL,
                lst,
                net: bit.grdBit.dat,
            })

            src = bit.chcBit.src
            if (!src) break
            const targetFolder = src.replace(/[[\]]/g, '').trim()
            const targetPath = path.join(repoRoot, targetFolder)

            const IGNORE_MENU_DIRS = new Set([
                'node_modules',
                'dist',
                'data',
                '.git',
            ])
            let childDirs: string[] = []

            try {
                if (FS.existsSync(targetPath)) {
                    const entries = FS.readdirSync(targetPath, {
                        withFileTypes: true,
                    })
                    for (const entry of entries) {
                        if (
                            entry.isDirectory() &&
                            !IGNORE_MENU_DIRS.has(entry.name)
                        ) {
                            childDirs.push(entry.name)
                        }
                    }
                }
            } catch {
                // ignore read error
            }

            childDirs.sort((a, b) => a.localeCompare(b))

            if (childDirs.length === 0) {
                await ste.hunt(ActCns.UPDATE_CONSOLE, {
                    idx: 'cns00',
                    src: `No directories found in ${targetFolder}`,
                })
                break
            }

            let childSelection = ''
            dex = 0
            while (childSelection === '') {
                const items = childDirs.slice(dex, dex + 10)
                const list = [...items]
                if (childDirs.length > 10) list.push('MORE')

                bit = await ste.hunt(ActGrd.UPDATE_GRID, {
                    x: 0,
                    y: 4,
                    xSpan: 4,
                    ySpan: 12,
                })
                bit = await ste.hunt(ActChc.OPEN_CHOICE, {
                    dat: { clr0: Color.BLACK, clr1: Color.YELLOW },
                    src: Align.VERTICAL,
                    lst: list,
                    net: bit.grdBit.dat,
                })

                src = bit.chcBit.src
                if (src === 'MORE') {
                    dex = dex + 10 >= childDirs.length ? 0 : dex + 10
                    await ste.hunt(ActTrm.CLEAR_TERMINAL, {})
                } else {
                    childSelection = src
                }
            }

            if (!childSelection) break
            const selectedDir = childSelection.replace(/[[\]]/g, '').trim()
            const selectedFullPath = path.join(targetPath, selectedDir)

            await ste.hunt(ActTrm.CLEAR_TERMINAL, {})

            // Discover and list units (*.unit) within the selected project/workspace
            let unitSearchDir = selectedFullPath
            if (FS.existsSync(path.join(selectedFullPath, selectedDir))) {
                unitSearchDir = path.join(selectedFullPath, selectedDir)
            }

            let unitDirs: string[] = []
            try {
                if (FS.existsSync(unitSearchDir)) {
                    const entries = FS.readdirSync(unitSearchDir, {
                        withFileTypes: true,
                    })
                    for (const entry of entries) {
                        if (
                            entry.isDirectory() &&
                            /^\d{2}\..+\.unit$/.test(entry.name)
                        ) {
                            unitDirs.push(entry.name)
                        }
                    }
                }
            } catch {
                // ignore read error
            }

            unitDirs.sort((a, b) => a.localeCompare(b))

            let finalUnitToFlatten = selectedDir
            let finalUnitPath = selectedFullPath

            if (unitDirs.length > 0) {
                let unitSelection = ''
                dex = 0
                while (unitSelection === '') {
                    const items = unitDirs.slice(dex, dex + 10)
                    const list = [...items]
                    if (unitDirs.length > 10) list.push('MORE')

                    bit = await ste.hunt(ActGrd.UPDATE_GRID, {
                        x: 0,
                        y: 4,
                        xSpan: 4,
                        ySpan: 12,
                    })
                    bit = await ste.hunt(ActChc.OPEN_CHOICE, {
                        dat: { clr0: Color.BLACK, clr1: Color.YELLOW },
                        src: Align.VERTICAL,
                        lst: list,
                        net: bit.grdBit.dat,
                    })

                    const res = bit?.chcBit?.src
                    if (res === 'MORE') {
                        dex = dex + 10 >= unitDirs.length ? 0 : dex + 10
                        await ste.hunt(ActTrm.CLEAR_TERMINAL, {})
                    } else if (res) {
                        unitSelection = res
                    } else {
                        break
                    }
                }

                if (!unitSelection) break
                finalUnitToFlatten = unitSelection.replace(/[[\]]/g, '').trim()
                finalUnitPath = path.join(unitSearchDir, finalUnitToFlatten)
            }

            await ste.hunt(ActTrm.CLEAR_TERMINAL, {})
            await ste.hunt(ActCns.UPDATE_CONSOLE, {
                idx: 'cns00',
                src: `Flattening ${finalUnitToFlatten}... Please wait.`,
            })

            const flattenUnitBit = await ste.hunt(ActUnt.FLATTEN_UNIT, {
                idx: finalUnitToFlatten,
                src: finalUnitPath,
            })

            await ste.hunt(ActCns.UPDATE_CONSOLE, {
                idx: 'cns00',
                src: `Flattened to ${flattenUnitBit?.untBit?.src || finalUnitToFlatten}`,
            })

            bit = await ste.hunt(ActMnu.PRINT_MENU, flattenUnitBit)
            break
        }

        case ActLib.FLAT_LIBRARY.split(']')[1]: {
            await ste.hunt(ActTrm.CLEAR_TERMINAL, {})
            await ste.hunt(ActCns.UPDATE_CONSOLE, {
                idx: 'cns00',
                src: 'Flattening library... Please wait.',
            })
            bit = await ste.hunt(ActLib.FLAT_LIBRARY, {})
            await ste.hunt(ActCns.UPDATE_CONSOLE, {
                idx: 'cns00',
                src:
                    'Library flattened to ' + (bit?.libBit?.src || 'data/flat'),
            })
            bit = await ste.hunt(ActMnu.PRINT_MENU, bit)
            break
        }

        case ActLib.LIST_LIBRARY.split(']')[1]: {
            await ste.hunt(ActTrm.CLEAR_TERMINAL, {})
            bit = await ste.hunt(ActLib.LIST_LIBRARY, {})
            lst = bit.libBit.lst

            if (lst.length === 0) {
                bit = await ste.hunt(ActCns.UPDATE_CONSOLE, {
                    idx: 'cns00',
                    src: 'No Libraries Found',
                })
            } else {
                bit = await ste.hunt(ActCns.UPDATE_CONSOLE, {
                    idx: 'cns00',
                    src: 'Listing Libraries...',
                })
                lst.forEach((a: string) =>
                    ste.hunt(ActCns.UPDATE_CONSOLE, { idx: 'cns00', src: a }),
                )
            }

            await new Promise((resolve) => setTimeout(resolve, 3000))
            break
        }

        case ActLib.AUDIT_LIBRARY.split(']')[1]: {
            await ste.hunt(ActTrm.CLEAR_TERMINAL, {})
            bit = await ste.hunt(ActCns.UPDATE_CONSOLE, {
                idx: 'cns00',
                src: '>> Executing Fleet Drift Audit...',
            })

            bit = await ste.hunt(ActLib.AUDIT_LIBRARY, {})
            const data = bit?.libBit?.dat

            if (data) {
                const { totalTracked, alignedCount, driftedCount } = data
                ste.hunt(ActCns.UPDATE_CONSOLE, {
                    idx: 'cns00',
                    src: `--- AUDIT SUMMARY ---`,
                })
                ste.hunt(ActCns.UPDATE_CONSOLE, {
                    idx: 'cns00',
                    src: `Total Repositories: ${totalTracked}`,
                })
                ste.hunt(ActCns.UPDATE_CONSOLE, {
                    idx: 'cns00',
                    src: `Aligned: ${alignedCount}`,
                })
                ste.hunt(ActCns.UPDATE_CONSOLE, {
                    idx: 'cns00',
                    src: `Drifted: ${driftedCount}`,
                })
            }

            await new Promise((resolve) => setTimeout(resolve, 333))
            bit = await ste.hunt(ActMnu.PRINT_MENU, bit)
            break
        }

        case ActLib.UPDATE_LIBRARY.split(']')[1]: {
            await ste.hunt(ActTrm.CLEAR_TERMINAL, {})
            bit = await ste.hunt(ActLib.LIST_LIBRARY, {})
            const fullLibList = bit.libBit.lst
            const displayLibList = fullLibList.map((item: string) => {
                const clean = item.replace(/[[\]]/g, '')
                const parts = clean.split('/')
                return `[${parts[parts.length - 1]}]`
            })

            let libSelection = ''
            dex = 0
            while (libSelection === '') {
                const items = displayLibList.slice(dex, dex + 10)
                const list = [...items]
                if (displayLibList.length > 10) list.push('MORE')

                bit = await ste.hunt(ActGrd.UPDATE_GRID, {
                    x: 0,
                    y: 4,
                    xSpan: 4,
                    ySpan: 12,
                })
                bit = await ste.hunt(ActChc.OPEN_CHOICE, {
                    dat: { clr0: Color.BLACK, clr1: Color.YELLOW },
                    src: Align.VERTICAL,
                    lst: list,
                    net: bit.grdBit.dat,
                })

                src = bit.chcBit.src
                if (src === 'MORE') {
                    dex = dex + 10 >= displayLibList.length ? 0 : dex + 10
                    await ste.hunt(ActTrm.CLEAR_TERMINAL, {})
                } else {
                    const selectedIdx = displayLibList.indexOf(src)
                    libSelection = fullLibList[selectedIdx]
                }
            }

            await ste.hunt(ActTrm.CLEAR_TERMINAL, {})
            bit = await ste.hunt(ActLib.UPDATE_LIBRARY, {
                src: libSelection,
            })
            bit = await ste.hunt(ActMnu.PRINT_MENU, bit)
            break
        }

        case ActLib.PROGRESS_LIBRARY.split(']')[1]: {
            await ste.hunt(ActTrm.CLEAR_TERMINAL, {})
            bit = await ste.hunt(ActLib.SCAN_LIBRARY, {})
            const targets: string[] = bit?.libBit?.lst || []

            if (targets.length === 0) {
                await ste.hunt(ActCns.UPDATE_CONSOLE, {
                    idx: 'cns00',
                    src: '>> [FLEET NOTICE] No sibling repositories discovered.',
                })
                bit = await ste.hunt(ActMnu.PRINT_MENU, bit)
                break
            }

            const allSiblingsLabel = `[ALL SIBLINGS (${targets.length})]`
            lst = [allSiblingsLabel, ...targets]

            const descriptions: Record<string, string> = {
                [allSiblingsLabel]: `-Atomically broadcast 995.library\nacross all ${targets.length} sibling repositories.`,
            }

            for (const t of targets) {
                descriptions[t] = `-Synchronize 995.library into\n${t}`
            }

            bit = await ste.hunt(ActGrd.UPDATE_GRID, {
                x: 0,
                y: 4,
                xSpan: 4,
                ySpan: 12,
            })
            bit = await ste.hunt(ActChc.OPEN_CHOICE, {
                dat: {
                    clr0: Color.BLACK,
                    clr1: Color.YELLOW,
                    cb: (choice: string) => {
                        const text =
                            descriptions[choice] || 'No description available.'
                        text.split('\n').forEach((s: string) =>
                            ste.hunt(ActCns.UPDATE_CONSOLE, {
                                idx: 'cns00',
                                src: s,
                            }),
                        )
                    },
                },
                src: Align.VERTICAL,
                lst,
                net: bit.grdBit.dat,
            })
            src = bit?.chcBit?.src

            await ste.hunt(ActTrm.CLEAR_TERMINAL, {})

            if (src === allSiblingsLabel || src === '[ALL SIBLINGS]') {
                // Two-phase safety confirmation modal
                const confirmGrid = await ste.hunt(ActGrd.UPDATE_GRID, {
                    x: 0,
                    y: 4,
                    xSpan: 4,
                    ySpan: 4,
                })
                const confirmChoice = await ste.hunt(ActChc.OPEN_CHOICE, {
                    dat: {
                        clr0: Color.BLACK,
                        clr1: Color.YELLOW,
                        cb: (choice: string) => {
                            ste.hunt(ActCns.UPDATE_CONSOLE, {
                                idx: 'cns00',
                                src: choice.startsWith('[YES]')
                                    ? `>> [CONFIRM] Broadcast to ${targets.length} sibling repositories.`
                                    : '>> [ABORT] Cancel batch synchronization.',
                            })
                        },
                    },
                    src: Align.VERTICAL,
                    lst: [
                        '[NO]  CANCEL BATCH SYNC',
                        `[YES] BROADCAST TO ${targets.length} SIBLINGS`,
                    ],
                    net: confirmGrid.grdBit.dat,
                })

                await ste.hunt(ActTrm.CLEAR_TERMINAL, {})

                if (confirmChoice?.chcBit?.src?.startsWith('[YES]')) {
                    await ste.hunt(ActCns.UPDATE_CONSOLE, {
                        idx: 'cns00',
                        src: `>> [SAGA] Initiating batch broadcast to ${targets.length} sibling repos...`,
                    })

                    const sagaRes: any = await ste.hunt(
                        ActLib.PROGRESS_LIBRARY_SAGA,
                        {
                            lst: targets,
                        },
                    )

                    if (
                        sagaRes?.libBit?.idx === 'progress-library-saga-error'
                    ) {
                        await ste.hunt(ActMnu.SAGA_TORN_STATE_MENU, {
                            dat: sagaRes?.libBit?.dat,
                        })
                        return cpy
                    }

                    await ste.hunt(ActCns.UPDATE_CONSOLE, {
                        idx: 'cns00',
                        src: `>> [OK] Fleet propagation completed for ${targets.length} repositories.`,
                    })
                } else {
                    await ste.hunt(ActCns.UPDATE_CONSOLE, {
                        idx: 'cns00',
                        src: '>> [ABORT] Batch broadcast cancelled by operator.',
                    })
                }
            } else if (src) {
                await ste.hunt(ActCns.UPDATE_CONSOLE, {
                    idx: 'cns00',
                    src: `>> [SAGA] Progressing library to target: ${src}`,
                })

                const sagaRes: any = await ste.hunt(
                    ActLib.PROGRESS_LIBRARY_SAGA,
                    {
                        lst: [src],
                    },
                )

                if (sagaRes?.libBit?.idx === 'progress-library-saga-error') {
                    await ste.hunt(ActMnu.SAGA_TORN_STATE_MENU, {
                        dat: sagaRes?.libBit?.dat,
                    })
                    return cpy
                }

                await ste.hunt(ActCns.UPDATE_CONSOLE, {
                    idx: 'cns00',
                    src: `>> [OK] Target synchronization complete: ${src}`,
                })
            } else {
                await ste.hunt(ActCns.UPDATE_CONSOLE, {
                    idx: 'cns00',
                    src: '>> [NOTICE] No directory selected.',
                })
            }

            bit = await ste.hunt(ActMnu.PRINT_MENU, bit)
            break
        }

        case ActMnu.UPDATE_MENU.split(']')[1]: {
            await ste.hunt(ActTrm.CLEAR_TERMINAL, {})
            bit = await ste.hunt(ActMnu.UPDATE_MENU, {})
            bit = await ste.hunt(ActMnu.PRINT_MENU, bit)
            break
        }

        case 'ROOT MENU': {
            // Defensive teardown prior to returning to master navigation switchboard
            await ste.hunt(ActTrm.CLEAR_TERMINAL, {})
            bit = await ste.hunt(ActMnu.UPDATE_MENU, {})
            return cpy
        }

        default: {
            await ste.hunt(ActTrm.CLEAR_TERMINAL, {})
            bit = await ste.hunt(ActTrm.CLOSE_TERMINAL, {})
            break
        }
    }

    const timer = setTimeout(async () => {
        bit = await ste.hunt(ActMnu.LIBRARY_MENU, {})
    }, 333)
    if (timer && typeof timer.unref === 'function') timer.unref()

    return cpy
}
