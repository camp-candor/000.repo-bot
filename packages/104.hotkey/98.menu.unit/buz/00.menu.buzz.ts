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
        'RUN DEFAULT HOTKEY (000..ahk)',
        'EXECUTE CUSTOM HOTKEY SCRIPT...',
        'LIST DATA/HOTKEY SCRIPTS',
        'ROOT MENU',
    ]

    const descriptions: Record<string, string> = {
        'RUN DEFAULT HOTKEY (000..ahk)':
            'Execute 000..ahk from data/hotkey/.\nAuto-creates center mouse test if missing.',
        'RUN DEFAULT':
            'Execute 000..ahk from data/hotkey/.\nAuto-creates center mouse test if missing.',
        'EXECUTE CUSTOM HOTKEY SCRIPT...':
            'Prompt for script name in data/hotkey/\nand trigger execution.',
        'EXECUTE CUSTOM':
            'Prompt for script name in data/hotkey/\nand trigger execution.',
        'LIST DATA/HOTKEY SCRIPTS':
            'Scan data/hotkey/ and display all\navailable .ahk files in cns00.',
        'LIST DATA/HOTKEY':
            'Scan data/hotkey/ and display all\navailable .ahk files in cns00.',
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
        case 'RUN DEFAULT HOTKEY (000..ahk)':
        case 'RUN DEFAULT':
            await ste.hunt(ActHtk.EXECUTE_HOTKEY, { src: '000..ahk' })
            await new Promise((r) => setTimeout(r, 1200))
            break

        case 'EXECUTE CUSTOM HOTKEY SCRIPT...':
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
                txt: 'Enter Script Name in data/hotkey (e.g. test):',
                net: inputGrid.grdBit.dat,
            })

            const scriptTarget = inputBit.putBit?.src?.trim() || '000..ahk'
            await ste.hunt(ActHtk.EXECUTE_HOTKEY, { src: scriptTarget })
            await new Promise((r) => setTimeout(r, 1200))
            break
        }

        case 'LIST DATA/HOTKEY SCRIPTS':
        case 'LIST DATA/HOTKEY': {
            let current = process.cwd()
            while (current && current !== path.dirname(current)) {
                if (fs.existsSync(path.join(current, 'package.json'))) break
                current = path.dirname(current)
            }
            const hotkeyPath = path.join(current, 'data', 'hotkey')

            if (fs.existsSync(hotkeyPath)) {
                const files = fs
                    .readdirSync(hotkeyPath)
                    .filter((f) => f.endsWith('.ahk'))
                await lib.hunt(UPDATE_CONSOLE, {
                    idx: 'cns00',
                    src: `>> Found ${files.length} script(s) in data/hotkey/:`,
                })
                files.forEach((f) =>
                    lib.hunt(UPDATE_CONSOLE, {
                        idx: 'cns00',
                        src: `   - ${f}`,
                    }),
                )
            } else {
                await lib.hunt(UPDATE_CONSOLE, {
                    idx: 'cns00',
                    src: '>> data/hotkey/ does not exist yet.',
                })
            }
            await new Promise((r) => setTimeout(r, 2000))
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
