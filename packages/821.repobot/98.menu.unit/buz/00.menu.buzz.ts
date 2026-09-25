/* eslint-disable */
import * as ActMnu from '../menu.action.js'
import * as ActRbt from '../../00.repobot.unit/repobot.action.js'

import type { MenuModel } from '../menu.model.js'
import type MenuBit from '../fce/menu.bit.js'
import type State from '../../99.core/state.js'

import * as Align from '../../val/align.js'
import * as Color from '../../val/console-color.js'

let bit: any
let rootSlv: any

const UPDATE_GRID = '[Grid action] Update Grid'
const WRITE_CONSOLE = '[Write action] Write Console'
const UPDATE_CONSOLE = '[Console action] Update Console'
const OPEN_CHOICE = '[Open action] Open Choice'
const CLOSE_TERMINAL = '[Close action] Close Terminal'
const PRINT_MENU = '[Render action] Print Menu'

const getBaseUrl = (): string => {
    return (
        (global as any).agentBaseUrl ||
        process.env.LIVE_WORKER_URL ||
        process.env.WORKER_URL ||
        'https://repo-bot-00.berad4000.workers.dev'
    ).replace(/\/$/, '')
}

export const initMenu = async (cpy: MenuModel, bal: MenuBit, ste: State) => {
    if (bal.slv != null) rootSlv = bal.slv

    const activeTarget =
        (global as any).agentBaseUrl || cpy.activeBaseUrl || getBaseUrl()

    bit = await (global as any).LIBRARY.hunt(UPDATE_GRID, {
        x: 4,
        y: 0,
        xSpan: 8,
        ySpan: 12,
    })
    bit = await (global as any).LIBRARY.hunt(WRITE_CONSOLE, {
        idx: 'cns00',
        src: '',
        dat: { net: bit.grdBit.dat, src: 'repobot0' },
    })

    bit = await (global as any).LIBRARY.hunt(UPDATE_CONSOLE, {
        idx: 'cns00',
        src: '-----------',
    })
    bit = await (global as any).LIBRARY.hunt(UPDATE_CONSOLE, {
        idx: 'cns00',
        src: 'REPOBOT MENU',
    })
    bit = await (global as any).LIBRARY.hunt(UPDATE_CONSOLE, {
        idx: 'cns00',
        src: `ACTIVE TARGET: ${activeTarget}`,
    })
    bit = await (global as any).LIBRARY.hunt(UPDATE_CONSOLE, {
        idx: 'cns00',
        src: '-----------',
    })

    await updateMenu(cpy, bal, ste)
    return cpy
}

export const updateMenu = async (cpy: MenuModel, bal: MenuBit, ste: State) => {
    const lst = [
        ActRbt.UPDATE_REPOBOT.split(']')[1],
        ActRbt.TEST_REPOBOT.split(']')[1],
        ActRbt.LIST_REPOBOT.split(']')[1],
        'ROOT MENU',
    ]

    bit = await (global as any).LIBRARY.hunt(UPDATE_GRID, {
        x: 0,
        y: 4,
        xSpan: 4,
        ySpan: 8,
    })

    const choiceBit = await (global as any).LIBRARY.hunt(OPEN_CHOICE, {
        dat: {
            clr0: Color.BLACK,
            clr1: Color.YELLOW,
        },
        src: Align.VERTICAL,
        lst,
        net: bit.grdBit.dat,
    })

    const src = choiceBit.chcBit.src

    switch (src) {
        case ActRbt.UPDATE_REPOBOT.split(']')[1]:
            bit = await ste.hunt(ActRbt.UPDATE_REPOBOT, {
                content: 'repobot Menu Selected',
            })
            bit = await (global as any).LIBRARY.hunt(PRINT_MENU, bit)
            break

        case ActRbt.TEST_REPOBOT.split(']')[1]:
            bit = await ste.hunt(ActRbt.TEST_REPOBOT, {
                content: 'repobot Menu Selected',
            })
            bit = await (global as any).LIBRARY.hunt(PRINT_MENU, bit)
            break

        case ActRbt.LIST_REPOBOT.split(']')[1]:
            bit = await ste.hunt(ActRbt.LIST_REPOBOT, {})
            const modelList = bit.rbtBit?.lst || []

            if (modelList.length === 0) {
                await (global as any).LIBRARY.hunt(UPDATE_CONSOLE, {
                    idx: 'cns00',
                    src: 'No repobot models found',
                })
            } else {
                await (global as any).LIBRARY.hunt(UPDATE_CONSOLE, {
                    idx: 'cns00',
                    src: 'Listing repobot models...',
                })
                modelList.forEach((a: string) =>
                    (global as any).LIBRARY.hunt(UPDATE_CONSOLE, {
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
            bit = await (global as any).LIBRARY.hunt(CLOSE_TERMINAL, {})
            break
    }

    setTimeout(async () => {
        bit = await ste.hunt(ActMnu.UPDATE_MENU, {})
    }, 333)

    return cpy
}
