import fs from 'node:fs'
import path from 'node:path'
import * as ActMnu from '../menu.action.js'
import * as ActHtk from '../../00.hotkey.unit/hotkey.action.js'

import type { MenuModel } from '../menu.model.js'
import type MenuBit from '../fce/menu.bit.js'
import type State from '../../99.core/state.js'

import * as Align from '../../val/align.js'
import * as Color from '../../val/console-color.js'

let rootSlv: any

const UPDATE_GRID = '[Grid action] Update Grid'
const WRITE_CONSOLE = '[Write action] Write Console'
const UPDATE_CONSOLE = '[Console action] Update Console'
const OPEN_CHOICE = '[Open action] Open Choice'
const OPEN_INPUT = '[Open action] Open Input'
const CLOSE_TERMINAL = '[Close action] Close Terminal'

export const initMenu = async (cpy: MenuModel, bal: MenuBit, ste: State) => {
    if (bal?.slv != null) rootSlv = bal.slv

    const lib = (globalThis as any).LIBRARY
    if (lib) {
        const bit = await lib.hunt(UPDATE_GRID, {
            x: 4,
            y: 0,
            xSpan: 8,
            ySpan: 12,
        })
        await lib.hunt(WRITE_CONSOLE, {
            idx: 'cns00',
            src: '',
            dat: { net: bit.grdBit.dat, src: 'hotkey0' },
        })
        await lib.hunt(UPDATE_CONSOLE, { idx: 'cns00', src: '-----------' })
        await lib.hunt(UPDATE_CONSOLE, {
            idx: 'cns00',
            src: 'HOTKEY WORKSPACE & AUTOMATION DECK',
        })
        await lib.hunt(UPDATE_CONSOLE, { idx: 'cns00', src: '-----------' })
    }

    await updateMenu(cpy, bal, ste)
    return cpy
}

export const updateMenu = async (cpy: MenuModel, bal: MenuBit, ste: State) => {
    const lib = (globalThis as any).LIBRARY
    if (!lib) return cpy

    const lst = [
        'RUN IN-MEMORY CALIBRATION (CENTER MOUSE)',
        'EXECUTE CUSTOM IN-MEMORY SCRIPT...',
        'ROOT MENU',
    ]

    const descriptions: Record<string, string> = {
        'RUN IN-MEMORY CALIBRATION (CENTER MOUSE)':
            'Stream in-memory center mouse calibration\nscript via native AutoHotkey stdin pipe.',
        'RUN IN-MEMORY':
            'Stream in-memory center mouse calibration\nscript via native AutoHotkey stdin pipe.',
        'RUN IN-MEMORY CALIBRATION':
            'Stream in-memory center mouse calibration\nscript via native AutoHotkey stdin pipe.',
        'EXECUTE CUSTOM IN-MEMORY SCRIPT...':
            'Prompt for custom AutoHotkey script\ncommands and execute via stdin pipe.',
        'EXECUTE CUSTOM':
            'Prompt for custom AutoHotkey script\ncommands and execute via stdin pipe.',
        'EXECUTE CUSTOM IN-MEMORY':
            'Prompt for custom AutoHotkey script\ncommands and execute via stdin pipe.',
        'ROOT MENU': 'Return to the main flight deck.',
    }

    const gridBit = await lib.hunt(UPDATE_GRID, {
        x: 0,
        y: 4,
        xSpan: 4,
        ySpan: 8,
    })
    const choiceBit = await lib.hunt(OPEN_CHOICE, {
        dat: {
            clr0: Color.BLACK,
            clr1: Color.YELLOW,
            cb: (choice: string) => {
                const text = descriptions[choice] || 'No description available.'
                text.split('\n').forEach((s) =>
                    lib.hunt(UPDATE_CONSOLE, { idx: 'cns00', src: s }),
                )
            },
        },
        src: Align.VERTICAL,
        lst,
        net: gridBit.grdBit.dat,
    })

    const src = choiceBit.chcBit.src

    switch (src) {
        case 'RUN IN-MEMORY CALIBRATION (CENTER MOUSE)':
        case 'RUN IN-MEMORY CALIBRATION':
        case 'RUN IN-MEMORY':
        case 'RUN DEFAULT':
            await ste.hunt(ActHtk.EXECUTE_HOTKEY, {})
            await new Promise((r) => setTimeout(r, 1200))
            break

        case 'EXECUTE CUSTOM IN-MEMORY SCRIPT...':
        case 'EXECUTE CUSTOM IN-MEMORY':
        case 'EXECUTE CUSTOM': {
            const inputGrid = await lib.hunt(UPDATE_GRID, {
                x: 0,
                y: 4,
                xSpan: 4,
                ySpan: 4,
            })
            const inputBit = await lib.hunt(OPEN_INPUT, {
                dat: { clr0: Color.BLACK, clr1: Color.YELLOW },
                src: Align.VERTICAL,
                lst: [],
                txt: 'Enter In-Memory AutoHotkey Script:',
                net: inputGrid.grdBit.dat,
            })

            const customScript = inputBit.putBit?.src?.trim() || ''
            await ste.hunt(ActHtk.EXECUTE_HOTKEY, { src: customScript })
            await new Promise((r) => setTimeout(r, 1200))
            break
        }

        case 'ROOT MENU':
            if (rootSlv != null) rootSlv({ mnuBit: { idx: 'root-menu' } })
            return cpy

        default:
            await ste.hunt(CLOSE_TERMINAL, {})
            break
    }

    setTimeout(() => {
        ste.hunt(ActMnu.UPDATE_MENU, {})
    }, 333)

    return cpy
}
