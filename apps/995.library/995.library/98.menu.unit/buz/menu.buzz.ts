/* eslint-disable */
import * as ActMnu from '../menu.action'

import * as ActClc from '../../97.collect.unit/collect.action'

import * as ActPut from '../../84.input.unit/input.action'
import * as ActTrm from '../../80.terminal.unit/terminal.action'
import * as ActChc from '../../85.choice.unit/choice.action'

import * as ActGrd from '../../81.grid.unit/grid.action'
//import * as ActCvs from "../../82.canvas.unit/canvas.action";
import * as ActCns from '../../83.console.unit/console.action'

import * as ActSow from '../../act/sower.action'

import * as ActNj4 from '../../act/neo4j.action'

import type { MenuModel } from '../menu.model'
import type MenuBit from '../fce/menu.bit'
import type State from '../../99.core/state'

import * as Grid from '../../val/grid'
import * as Align from '../../val/align'
import * as Color from '../../val/console-color'

import * as SHAPE from '../../val/shape'
import * as FOCUS from '../../val/focus'

let bit, lst, dex, idx, dat, src, val

let SOWER, CONCEPT, CLICKUP, OLLAMA, AGENT

let opened = false

export const initMenu = async (cpy: MenuModel, bal: MenuBit, ste: State) => {
    if (bal == null) bal = { idx: null }

    if (!opened) {
        opened = true
        const path = require('path')
        const pkg = require(path.resolve(process.cwd(), 'package.json'))
        const libPkg = require(
            path.resolve(process.cwd(), 'apps/995.library/package.json'),
        )

        bit = await ste.hunt(ActTrm.INIT_TERMINAL, {})
        bit = await ste.hunt(ActTrm.CLEAR_TERMINAL, {})
        bit = await ste.hunt(ActGrd.UPDATE_GRID, {
            x: 4,
            y: 0,
            xSpan: 5,
            ySpan: 12,
        })
        bit = await ste.hunt(ActCns.WRITE_CONSOLE, {
            idx: 'cns00',
            src: '',
            dat: { net: bit.grdBit.dat, src: 'alligaor0' },
        })

        bit = await ste.hunt(ActCns.UPDATE_CONSOLE, {
            idx: 'cns00',
            src: '-----------',
        })
        bit = await ste.hunt(ActCns.UPDATE_CONSOLE, {
            idx: 'cns00',
            src: `RUNNER V${pkg.version}`,
        })
        bit = await ste.hunt(ActCns.UPDATE_CONSOLE, {
            idx: 'cns00',
            src: `LIBRARY V${libPkg.version}`,
        })
        bit = await ste.hunt(ActCns.UPDATE_CONSOLE, {
            idx: 'cns00',
            src: '-----------',
        })
    } else {
        bit = await ste.hunt(ActTrm.CLEAR_TERMINAL, {})
    }

    if (bal.slv != null) bal.slv({ mnuBit: { idx: 'init-menu' } })

    return cpy
}

export const openMenu = async (cpy: MenuModel, bal: MenuBit, ste: State) => {
    const FS = require('fs-extra')

    const path = require('path')
    const exec = require('child_process').exec

    const pkg = FS.readJsonSync(path.resolve(process.cwd(), './package.json'))
    const version = pkg.version

    bit = await ste.hunt(ActCns.UPDATE_CONSOLE, {
        idx: 'cns00',
        src: '-----------',
    })
    bit = await ste.hunt(ActCns.UPDATE_CONSOLE, {
        idx: 'cns00',
        src: 'LIBRARY V' + version,
    })

    bit = await ste.hunt(ActCns.UPDATE_CONSOLE, {
        idx: 'cns00',
        src: '-----------',
    })

    updateMenu(cpy, bal, ste)

    return cpy
}

export const CONCEPT_MENU = '[Menu action] Concept Menu'
export const INIT_MENU = '[Menu action] Init Menu'

export const updateMenu = async (cpy: MenuModel, bal: MenuBit, ste: State) => {
    lst = ['LIBRARY MENU']
    const descriptions = {
        'LIBRARY MENU': 'Open the library menu\nto explore library features.',
    }

    const lstRoutes = Array.from(cpy.menuRoutes.keys())

    lst = [...lst, ...lstRoutes]

    bit = await ste.hunt(ActGrd.UPDATE_GRID, { x: 0, y: 4, xSpan: 4, ySpan: 8 })
    bit = await ste.hunt(ActChc.OPEN_CHOICE, {
        dat: {
            clr0: Color.BLACK,
            clr1: Color.YELLOW,
            cb: (choice: string) => {
                const text =
                    descriptions[choice] ||
                    cpy.menuRouteDescriptions?.get(choice) ||
                    'No description available.'
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
        case 'LIBRARY MENU':
            bit = await ste.hunt(ActMnu.LIBRARY_MENU, {})
            bit = await ste.hunt(ActMnu.PRINT_MENU, bit)
            bit = await ste.hunt(ActMnu.UPDATE_MENU)
            break

        default:
            if (cpy.menuRoutes.has(src)) {
                const handler = cpy.menuRoutes.get(src)

                await handler(cpy, bal, ste)
            } else {
                // Default fallback
                bit = await ste.hunt(ActTrm.CLOSE_TERMINAL, {})
            }

            //bit = await ste.hunt(ActTrm.CLOSE_TERMINAL, {});
            break
    }

    setTimeout(() => {
        updateMenu(cpy, bal, ste)
    }, 333)

    return cpy
}

export const testMenu = async (cpy: MenuModel, bal: MenuBit, ste: State) => {
    return cpy
}

export const closeMenu = async (cpy: MenuModel, bal: MenuBit, ste: State) => {
    await ste.hunt(ActTrm.CLOSE_TERMINAL, {})

    return cpy
}

export const createMenu = (cpy: MenuModel, bal: MenuBit, ste: State) => {
    debugger
    return cpy
}

export const printMenu = async (cpy: MenuModel, bal: MenuBit, ste: State) => {
    dat = bal
    if (dat == null) return bal.slv({ mnuBit: { idx: 'print-menu', dat } })

    const itm = JSON.stringify(dat)

    lst = itm.split(',')
    lst.forEach((a) =>
        ste.hunt(ActCns.UPDATE_CONSOLE, { idx: 'cns00', src: a }),
    )
    ste.hunt(ActCns.UPDATE_CONSOLE, { idx: 'cns00', src: '------------' })

    bal.slv({ mnuBit: { idx: 'print-menu', dat: itm } })
}

export const routeMenu = (cpy: MenuModel, bal: MenuBit, ste: State) => {
    cpy.menuRoutes.set(bal.idx, bal.fnc)
    if (bal.src) cpy.menuRouteDescriptions.set(bal.idx, bal.src)

    bal.slv({ mnuBit: { idx: 'route-menu', val: 1 } })
    return cpy
}

const patch = (ste, type, bale) => ste.dispatch({ type, bale })
