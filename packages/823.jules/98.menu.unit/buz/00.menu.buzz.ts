import * as ActJls from '../../00.jules.unit/jules.action.js'
import * as ActMnu from '../menu.action.js'
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

export const initMenu = async (cpy: MenuModel, bal: MenuBit, ste: State) => {
    if (bal.slv != null) rootSlv = bal.slv

    const targetUrl = (global as any).agentBaseUrl || 'http://127.0.0.1:8787'

    let bit = await (global as any).LIBRARY.hunt(UPDATE_GRID, {
        x: 4,
        y: 0,
        xSpan: 8,
        ySpan: 12,
    })
    await (global as any).LIBRARY.hunt(WRITE_CONSOLE, {
        idx: 'cns00',
        src: '',
        dat: { net: bit.grdBit.dat, src: 'jules0' },
    })

    await (global as any).LIBRARY.hunt(UPDATE_CONSOLE, {
        idx: 'cns00',
        src: '-----------',
    })
    await (global as any).LIBRARY.hunt(UPDATE_CONSOLE, {
        idx: 'cns00',
        src: 'JULES ORCHESTRATION MENU',
    })
    await (global as any).LIBRARY.hunt(UPDATE_CONSOLE, {
        idx: 'cns00',
        src: `>> TARGET CONTROL PLANE: ${targetUrl}`,
    })
    await (global as any).LIBRARY.hunt(UPDATE_CONSOLE, {
        idx: 'cns00',
        src: '-----------',
    })

    await updateMenu(cpy, bal, ste)
    return cpy
}

export const updateMenu = async (cpy: MenuModel, bal: MenuBit, ste: State) => {
    const lst = [
        'DISPATCH JULES TASK (TASK-01)',
        'POLL LAST JULES SESSION',
        'ROOT MENU',
    ]

    const bit = await (global as any).LIBRARY.hunt(UPDATE_GRID, {
        x: 0,
        y: 4,
        xSpan: 4,
        ySpan: 8,
    })

    const choiceBit = await (global as any).LIBRARY.hunt(OPEN_CHOICE, {
        dat: { clr0: Color.BLACK, clr1: Color.YELLOW },
        src: Align.VERTICAL,
        lst,
        net: bit.grdBit.dat,
    })

    const src = choiceBit.chcBit.src
    switch (src) {
        case 'DISPATCH JULES TASK (TASK-01)': {
            await (global as any).LIBRARY.hunt(UPDATE_CONSOLE, {
                idx: 'cns00',
                src: '>> [DISPATCH] Initiating ephemeral task for TASK-01...',
            })
            const res: any = await ste.hunt(ActJls.DISPATCH_JULES_TASK, {
                src: 'Refactor test assertions for gauntlet validation',
                dat: {
                    taskId: 'TASK-01',
                    repo: '000.repo-bot',
                    owner: 'camp-candor',
                    fileWhitelist: ['apps/worker/src/index.ts'],
                },
            })
            await (global as any).LIBRARY.hunt(UPDATE_CONSOLE, {
                idx: 'cns00',
                src: `>> RESULT: ${JSON.stringify(res?.jlsBit?.dat || res?.jlsBit?.src)}`,
            })
            await new Promise((resolve) => setTimeout(resolve, 2500))
            break
        }

        case 'POLL LAST JULES SESSION': {
            await (global as any).LIBRARY.hunt(UPDATE_CONSOLE, {
                idx: 'cns00',
                src: '>> [POLL] Querying active Jules session telemetry...',
            })
            const res: any = await ste.hunt(ActJls.CHECK_JULES_STATUS, {})
            await (global as any).LIBRARY.hunt(UPDATE_CONSOLE, {
                idx: 'cns00',
                src: `>> STATUS: ${JSON.stringify(res?.jlsBit?.dat || res?.jlsBit?.src)}`,
            })
            await new Promise((resolve) => setTimeout(resolve, 2500))
            break
        }

        case 'ROOT MENU':
            if (rootSlv != null) rootSlv({ mnuBit: { idx: 'root-menu' } })
            return cpy
    }

    setTimeout(async () => {
        await ste.hunt(ActMnu.UPDATE_MENU, {})
    }, 333)

    return cpy
}
