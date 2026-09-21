/* eslint-disable */
import { MenuModel } from '../menu.model'
import MenuBit from '../fce/menu.bit'
import State from '../../99.core/state'
//import { HexmapModel } from "../../03.hexmap.unit/hexmap.model";

import * as ActLib from '../../00.library.unit/library.action'
import * as ActUnt from '../../01.unit.unit/unit.action'
import * as ActAct from '../../02.action.unit/action.action'

import * as Grid from '../../val/grid'
import * as Align from '../../val/align'
import * as Color from '../../val/console-color'

import * as SHAPE from '../../val/shape'
import * as FOCUS from '../../val/focus'

import * as ActMnu from '../menu.action'

//import * as ActFoc from "../../01.focus.unit/focus.action";
//import * as ActPvt from "../../96.pivot.unit/pivot.action";
import * as ActGer from '../../05.gears.unit/gears.action'
import * as ActTrm from '../../80.terminal.unit/terminal.action'
import * as ActChc from '../../85.choice.unit/choice.action'
import * as ActPut from '../../84.input.unit/input.action'

import * as ActGrd from '../../81.grid.unit/grid.action'
import * as ActCns from '../../83.console.unit/console.action'

import * as ActTrn from '../../act/turn.action'
import * as ActClr from '../../act/color.action'
import * as ActSow from '../../act/sower.action'

import * as PVT from '../../val/pivot'

var bit, lst, dex, idx, dat, src

var opened = false

export const libraryMenu = async (cpy: MenuModel, bal: MenuBit, ste: State) => {
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
        ActGer.LORE_GEARS.split(']')[1],
        ActGer.CREATE_GEARS.split(']')[1],
        ActUnt.UPDATE_UNIT.split(']')[1],
        ActAct.UPDATE_ACTION.split(']')[1],
        ActUnt.CREATE_UNIT.split(']')[1],
        ActUnt.FLATTEN_UNIT.split(']')[1],
        ActLib.FLAT_LIBRARY.split(']')[1],
        ActLib.PROGRESS_LIBRARY.split(']')[1],
        ActLib.UPDATE_LIBRARY.split(']')[1],
        ActLib.LIST_LIBRARY.split(']')[1],
        ActLib.LAUNCH_LIBRARY.split(']')[1],
        'ROOT MENU',
    ]

    const descriptions: any = {
        [ActUnt.UPDATE_UNIT.split(']')[1]]:
            '-Update an existing unit\nin the library.',
        [ActAct.UPDATE_ACTION.split(']')[1]]:
            '-Update an action for\na specific unit \nso the library can use the action',
        [ActUnt.CREATE_UNIT.split(']')[1]]:
            '-Create a new unit\nwith a specified verb.',
        [ActUnt.FLATTEN_UNIT.split(']')[1]]:
            '-Flatten a unit into\nits constituent files.',
        [ActLib.FLAT_LIBRARY.split(']')[1]]:
            '-Flatten library code\ninto data/flat.',
        [ActLib.UPDATE_LIBRARY.split(']')[1]]:
            '-Regenerate the library\nwiring manifest (BEE.ts).',
        [ActLib.LIST_LIBRARY.split(']')[1]]:
            '-List all the units\ncurrently in the library.',
        [ActGer.LORE_GEARS.split(']')[1]]:
            '-List all GEARS units\ncurrently in the library.',
        [ActGer.CREATE_GEARS.split(']')[1]]:
            '-List all GEARS units\ncurrently in the library.',
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
                text.split('\n').forEach((src) =>
                    ste.hunt(ActCns.UPDATE_CONSOLE, {
                        idx: 'cns00',
                        src,
                    }),
                )
            },
        },
        src: Align.VERTICAL,
        lst,
        net: bit.grdBit.dat,
    })
    src = bit.chcBit.src

    switch (src) {
        case ActLib.LAUNCH_LIBRARY.split(']')[1]:
            bit = await ste.hunt(ActLib.LAUNCH_LIBRARY, {})
            break

        case ActGer.LORE_GEARS.split(']')[1]:
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
            src = bit.putBit.src

            var FS = require('fs-extra')

            bit = await ste.hunt(ActGer.LORE_GEARS, { src, dat: { fs: FS } })
            bit = await ste.hunt(ActMnu.PRINT_MENU, bit)
            bit = await ste.hunt(ActMnu.UPDATE_MENU)
            break

        case ActGer.CREATE_GEARS.split(']')[1]:
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
            src = bit.putBit.src

            var FS = require('fs-extra')

            bit = await ste.hunt(ActGer.CREATE_GEARS, { src, dat: { fs: FS } })
            bit = await ste.hunt(ActMnu.PRINT_MENU, bit)
            bit = await ste.hunt(ActMnu.UPDATE_MENU)
            break

        case ActAct.UPDATE_ACTION.split(']')[1]:
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

            var updateBit = await ste.hunt(ActAct.UPDATE_ACTION, { idx, src })
            break

        case ActUnt.CREATE_UNIT.split(']')[1]:
            bit = await ste.hunt(ActTrm.CLEAR_TERMINAL, {})

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

            var updateBit = await ste.hunt(ActUnt.CREATE_UNIT, { idx })

            bit = await ste.hunt(ActTrm.CLEAR_TERMINAL, {})

            bit = await ste.hunt(ActMnu.PRINT_MENU, updateBit)
            break

        case ActUnt.UPDATE_UNIT.split(']')[1]:
            bit = await ste.hunt(ActUnt.CONTAIN_UNIT, { src })
            const fullPivotList = bit.untBit.lst
            const pivotList = fullPivotList.map((item) => {
                const clean = item.replace(/[[\]]/g, '')
                const parts = clean.split('/')
                return `[${parts[parts.length - 1]}]`
            })
            lst = pivotList

            let pivotSelection = ''
            dex = 0
            while (pivotSelection == '') {
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

            const path = require('path')
            const parentDir = process.cwd()
            src = path.resolve(parentDir, pivotSelection)

            ste.hunt(ActCns.UPDATE_CONSOLE, {
                idx: 'cns00',
                src: `Resolving pivot: ${pivotSelection} -> ${src}`,
            })

            bit = await ste.hunt(ActUnt.LIST_UNIT, { src })
            const fullUnitList = bit.untBit.lst
            const unitList = fullUnitList.map((item) => {
                const parts = item.split('/')
                return parts[parts.length - 1]
            })

            let unitSelection = ''
            dex = 0
            while (unitSelection == '') {
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
                    // Use the index of the selected clean name to get the full path
                    const selectedIdx = unitList.indexOf(res)
                    idx = fullUnitList[selectedIdx]
                    unitSelection = res
                }
            }

            await ste.hunt(ActTrm.CLEAR_TERMINAL, {})

            //debugger;

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

            var updateBit = await ste.hunt(ActUnt.UPDATE_UNIT, {
                idx,
                src,
                dat,
            })
            bit = await ste.hunt(ActTrm.CLEAR_TERMINAL, {})
            bit = await ste.hunt(ActMnu.PRINT_MENU, updateBit)
            break

        case ActUnt.FLATTEN_UNIT.split(']')[1]:
            lst = ['MINDTRUST_SOWER', 'GLOPS_OLLAMA', 'MINDTRUST_SCRIBE']
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
            src = process.env[src]
            var root = src

            bit = await ste.hunt(ActLib.LIST_LIBRARY, { src })
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
            if (src) src = src.replace(/[[\]]/g, '')
            src = '../../' + src
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

            src = root + '/' + src

            var updateBit = await ste.hunt(ActUnt.FLATTEN_UNIT, {
                idx,
                src,
                dat,
            })

            bit = await ste.hunt(ActMnu.PRINT_MENU, updateBit)
            break

        case ActLib.FLAT_LIBRARY.split(']')[1]:
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

        case ActUnt.CREATE_UNIT.split(']')[1]:
            bit = await ste.hunt(ActTrm.CLEAR_TERMINAL, {})

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

            var updateBit = await ste.hunt(ActUnt.CREATE_UNIT, { idx })

            bit = await ste.hunt(ActTrm.CLEAR_TERMINAL, {})

            bit = await ste.hunt(ActMnu.PRINT_MENU, updateBit)
            break

        case ActLib.LIST_LIBRARY.split(']')[1]:
            var bit = await ste.hunt(ActLib.LIST_LIBRARY, {})
            lst = bit.libBit.lst

            if (lst.length == 0) {
                bit = await ste.hunt(ActCns.UPDATE_CONSOLE, {
                    idx: 'cns00',
                    src: 'No Libraries Found',
                })
            } else {
                bit = await ste.hunt(ActCns.UPDATE_CONSOLE, {
                    idx: 'cns00',
                    src: 'Listing Libraries...',
                })
                lst.forEach((a) =>
                    ste.hunt(ActCns.UPDATE_CONSOLE, { idx: 'cns00', src: a }),
                )
            }

            await new Promise((resolve) => setTimeout(resolve, 3000))

            break

        case ActLib.UPDATE_LIBRARY.split(']')[1]:
            var bit = await ste.hunt(ActLib.LIST_LIBRARY, {})
            const fullLibList = bit.libBit.lst
            const displayLibList = fullLibList.map((item) => {
                const clean = item.replace(/[[\]]/g, '')
                const parts = clean.split('/')
                return `[${parts[parts.length - 1]}]`
            })

            let libSelection = ''
            dex = 0
            while (libSelection == '') {
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

            var bit = await ste.hunt(ActLib.UPDATE_LIBRARY, {
                src: libSelection,
            })
            bit = await ste.hunt(ActMnu.PRINT_MENU, bit)
            break

        case ActLib.PROGRESS_LIBRARY.split(']')[1]:
            bit = await ste.hunt(ActLib.SCAN_LIBRARY, {})
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

            if (src) {
                await ste.hunt(ActCns.UPDATE_CONSOLE, {
                    idx: 'cns00',
                    src: 'Progressing library... Please wait.',
                })
                bit = await ste.hunt(ActLib.PROGRESS_LIBRARY, { src })
                await ste.hunt(ActCns.UPDATE_CONSOLE, {
                    idx: 'cns00',
                    src: 'Library progression completed.',
                })
            } else {
                ste.hunt(ActCns.UPDATE_CONSOLE, {
                    idx: 'cns00',
                    src: 'No directory selected',
                })
            }

            bit = await ste.hunt(ActMnu.PRINT_MENU, bit)
            break

        case ActMnu.UPDATE_MENU.split(']')[1]:
            bit = await ste.hunt(ActMnu.UPDATE_MENU, {})
            bit = await ste.hunt(ActMnu.PRINT_MENU, bit)
            break

        case 'ROOT MENU':
            bit = await ste.hunt(ActMnu.UPDATE_MENU, {})
            return cpy

        default:
            bit = await ste.hunt(ActTrm.CLOSE_TERMINAL, {})
            break
    }

    setTimeout(async () => {
        bit = await ste.hunt(ActMnu.LIBRARY_MENU, {})
    }, 333)

    return cpy
}

var patch = (ste, type, bale) => ste.dispatch({ type, bale })
