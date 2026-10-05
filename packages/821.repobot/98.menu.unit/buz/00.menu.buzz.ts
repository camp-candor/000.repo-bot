import * as ActMnu from '../menu.action.js'
import * as ActRbt from '../../00.repobot.unit/repobot.action.js'
import { getBaseUrl } from '../../00.repobot.unit/buz/repobot.buzz.js'

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

export const initMenu = async (
    cpy: MenuModel,
    bal?: MenuBit,
    ste?: State,
): Promise<MenuModel> => {
    if (bal?.slv != null) rootSlv = bal.slv

    cpy.activeTargetUrl = getBaseUrl()

    const lib = (globalThis as any).LIBRARY || (global as any).LIBRARY
    if (lib && typeof lib.hunt === 'function') {
        bit = await lib.hunt(UPDATE_GRID, {
            x: 4,
            y: 0,
            xSpan: 8,
            ySpan: 12,
        })
        await lib.hunt(WRITE_CONSOLE, {
            idx: 'cns00',
            src: '',
            dat: { net: bit.grdBit?.dat, src: 'repobot0' },
        })

        const repobotState =
            ste?.value?.repobot?.connectionState || 'DISCONNECTED'

        await lib.hunt(UPDATE_CONSOLE, {
            idx: 'cns00',
            src: '--------------------------------------------------',
        })
        await lib.hunt(UPDATE_CONSOLE, {
            idx: 'cns00',
            src: 'REPO-BOT TELEMETRY & EDGE COORDINATOR HUD',
        })
        await lib.hunt(UPDATE_CONSOLE, {
            idx: 'cns00',
            src: `ACTIVE TARGET: [${cpy.activeTargetUrl}]`,
        })
        await lib.hunt(UPDATE_CONSOLE, {
            idx: 'cns00',
            src: `TELEMETRY LINK: [${repobotState}]`,
        })
        await lib.hunt(UPDATE_CONSOLE, {
            idx: 'cns00',
            src: '--------------------------------------------------',
        })
    }

    await updateMenu(cpy, bal, ste)
    return cpy
}

export const updateMenu = async (
    cpy: MenuModel,
    bal?: MenuBit,
    ste?: State,
): Promise<MenuModel> => {
    const lib = (globalThis as any).LIBRARY || (global as any).LIBRARY
    if (!lib || typeof lib.hunt !== 'function') {
        if (bal?.slv) bal.slv({ mnuBit: { idx: 'update-menu-headless' } })
        return cpy
    }

    const repobotState = ste?.value?.repobot?.connectionState || 'DISCONNECTED'

    const lst = [
        'CONNECT REPOBOT TELEMETRY',
        'DISCONNECT REPOBOT TELEMETRY',
        'INSPECT TELEMETRY STATUS',
        'ROOT MENU',
    ]

    const descriptions: Record<string, string> = {
        'CONNECT REPOBOT TELEMETRY': `Dial edge WebSocket (/ws/telemetry) to stream live events.\nStatus: [${repobotState}]`,
        'DISCONNECT REPOBOT TELEMETRY':
            'Dismantle telemetry tunnel and cancel reconnect timers.',
        'INSPECT TELEMETRY STATUS':
            'Print connection state, sequence counter, and active endpoint.',
        'ROOT MENU': 'Return to the main runner switchboard.',
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
            clr1: repobotState === 'CONNECTED' ? Color.GREEN : Color.YELLOW,
            cb: (choice: string) => {
                const text = descriptions[choice] || 'No description available.'
                text.split('\n').forEach((s) =>
                    lib.hunt(UPDATE_CONSOLE, { idx: 'cns00', src: s }),
                )
            },
        },
        src: Align.VERTICAL,
        lst,
        net: gridBit.grdBit?.dat,
    })

    const src = choiceBit.chcBit?.src

    switch (src) {
        case 'CONNECT REPOBOT TELEMETRY': {
            await lib.hunt(UPDATE_CONSOLE, {
                idx: 'cns00',
                src: '>> [WS] Dialing Edge Coordinator telemetry tunnel...',
            })
            if (ste?.hunt) {
                await ste.hunt(ActRbt.CONNECT_REPOBOT, {})
            }
            await new Promise((r) => setTimeout(r, 1500))
            break
        }

        case 'DISCONNECT REPOBOT TELEMETRY': {
            await lib.hunt(UPDATE_CONSOLE, {
                idx: 'cns00',
                src: '>> [WS] Halting telemetry stream and clearing timers...',
            })
            if (ste?.hunt) {
                await ste.hunt(ActRbt.DISCONNECT_REPOBOT, {})
            }
            await new Promise((r) => setTimeout(r, 1500))
            break
        }

        case 'INSPECT TELEMETRY STATUS': {
            const rbt = ste?.value?.repobot
            await lib.hunt(UPDATE_CONSOLE, {
                idx: 'cns00',
                src: '>> --------------------------------------------------',
            })
            await lib.hunt(UPDATE_CONSOLE, {
                idx: 'cns00',
                src: '>> TELEMETRY TUNNEL DIAGNOSTICS:',
            })
            await lib.hunt(UPDATE_CONSOLE, {
                idx: 'cns00',
                src: `>> • Connection State  : [${rbt?.connectionState || 'UNKNOWN'}]`,
            })
            await lib.hunt(UPDATE_CONSOLE, {
                idx: 'cns00',
                src: `>> • Last Sequence ID  : #${rbt?.lastSeqReceived || 0}`,
            })
            await lib.hunt(UPDATE_CONSOLE, {
                idx: 'cns00',
                src: `>> • Reconnect Attempts: ${rbt?.reconnectAttempts || 0}`,
            })
            await lib.hunt(UPDATE_CONSOLE, {
                idx: 'cns00',
                src: `>> • Active Base Target: ${rbt?.activeBaseUrl || getBaseUrl()}`,
            })
            await lib.hunt(UPDATE_CONSOLE, {
                idx: 'cns00',
                src: '>> --------------------------------------------------',
            })
            await new Promise((r) => setTimeout(r, 2000))
            break
        }

        case 'ROOT MENU': {
            if (rootSlv != null) rootSlv({ mnuBit: { idx: 'root-menu' } })
            return cpy
        }

        default: {
            await lib.hunt(CLOSE_TERMINAL, {})
            break
        }
    }

    setTimeout(async () => {
        if (ste?.hunt) {
            await ste.hunt(ActMnu.UPDATE_MENU, {})
        }
    }, 333)

    return cpy
}
