/* eslint-disable */
import * as ActMnu from '../menu.action.js'
import * as ActOlm from '../../00.github.unit/github.action.js'

import type { MenuModel } from '../menu.model.js'
import type MenuBit from '../fce/menu.bit.js'
import type State from '../../99.core/state.js'

import * as Grid from '../../val/grid.js'
import * as Align from '../../val/align.js'
import * as Color from '../../val/console-color.js'

let bit: any, lst: string[], src: string
let rootSlv: any

const UPDATE_GRID = '[Grid action] Update Grid'
const WRITE_CONSOLE = '[Write action] Write Console'
const UPDATE_CONSOLE = '[Console action] Update Console'
const OPEN_CHOICE = '[Open action] Open Choice'
const CLOSE_TERMINAL = '[Close action] Close Terminal'
const PRINT_MENU = '[Render action] Print Menu'

export const initMenu = async (cpy: MenuModel, bal: MenuBit, ste: State) => {
    if (bal.slv != null) rootSlv = bal.slv

    bit = await global.LIBRARY.hunt(UPDATE_GRID, {
        x: 4,
        y: 0,
        xSpan: 8,
        ySpan: 12,
    })
    bit = await global.LIBRARY.hunt(WRITE_CONSOLE, {
        idx: 'cns00',
        src: '',
        dat: { net: bit.grdBit.dat, src: 'alligator0' },
    })

    bit = await global.LIBRARY.hunt(UPDATE_CONSOLE, {
        idx: 'cns00',
        src: '-----------',
    })
    bit = await global.LIBRARY.hunt(UPDATE_CONSOLE, {
        idx: 'cns00',
        src: 'GITHUB MENU',
    })
    bit = await global.LIBRARY.hunt(UPDATE_CONSOLE, {
        idx: 'cns00',
        src: '-----------',
    })

    await updateMenu(cpy, bal, ste)
    return cpy
}

export const updateMenu = async (cpy: MenuModel, bal: MenuBit, ste: State) => {
    const SMOKE_TEST_LABEL = 'RUN WEBHOOK SMOKE TEST'

    lst = [
        ActOlm.UPDATE_GITHUB.split(']')[1],
        SMOKE_TEST_LABEL,
        ActOlm.LIST_GITHUB.split(']')[1],
        'ROOT MENU',
    ]

    const descriptions: Record<string, string> = {
        [ActOlm.UPDATE_GITHUB.split(']')[1]]: 'Update GitHub configuration.',
        [SMOKE_TEST_LABEL]:
            'Fire negative (401) and positive (202)\nsynthetic signed PR webhook to isolate.',
        [ActOlm.LIST_GITHUB.split(']')[1]]: 'List tracked GitHub repositories.',
        'ROOT MENU': 'Return to the main runner menu.',
    }

    bit = await global.LIBRARY.hunt(UPDATE_GRID, {
        x: 0,
        y: 4,
        xSpan: 4,
        ySpan: 8,
    })
    bit = await global.LIBRARY.hunt(OPEN_CHOICE, {
        dat: {
            clr0: Color.BLACK,
            clr1: Color.YELLOW,
            cb: (choice: string) => {
                const text = descriptions[choice] || 'No description available.'
                text.split('\n').forEach((line) =>
                    global.LIBRARY.hunt(UPDATE_CONSOLE, {
                        idx: 'cns00',
                        src: line,
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
        case ActOlm.UPDATE_GITHUB.split(']')[1]:
            bit = await ste.hunt(ActOlm.UPDATE_GITHUB, {
                content: 'Github Menu Selected',
            })
            bit = await global.LIBRARY.hunt(PRINT_MENU, bit)
            break

        case SMOKE_TEST_LABEL:
        case ActOlm.TEST_GITHUB.split(']')[1]:
            bit = await ste.hunt(ActOlm.TEST_GITHUB, {
                content: 'Smoke Test Dispatched',
            })
            await new Promise((resolve) => setTimeout(resolve, 2500))
            break

        case ActOlm.LIST_GITHUB.split(']')[1]:
            bit = await ste.hunt(ActOlm.LIST_GITHUB, {})
            lst = bit.gthBit?.lst || []

            if (lst.length === 0) {
                bit = await global.LIBRARY.hunt(UPDATE_CONSOLE, {
                    idx: 'cns00',
                    src: 'No Github Models Found',
                })
            } else {
                bit = await global.LIBRARY.hunt(UPDATE_CONSOLE, {
                    idx: 'cns00',
                    src: 'Listing Github Models...',
                })
                lst.forEach((a: string) =>
                    global.LIBRARY.hunt(UPDATE_CONSOLE, {
                        idx: 'cns00',
                        src: a,
                    }),
                )
            }
            await new Promise((resolve) => setTimeout(resolve, 3000))
            break

        case 'ROOT MENU':
            if (rootSlv != null) rootSlv({ mnuBit: { idx: 'root-menu' } })
            return cpy

        default:
            bit = await ste.hunt(CLOSE_TERMINAL, {})
            break
    }

    setTimeout(async () => {
        bit = await ste.hunt(ActMnu.UPDATE_MENU, {})
    }, 333)

    return cpy
}
