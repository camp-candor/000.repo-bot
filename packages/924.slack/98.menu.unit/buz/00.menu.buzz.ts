/* eslint-disable */
import * as ActMnu from '../menu.action.js'
import * as ActSlack from '../../00.slack.unit/slack.action.js'

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
const OPEN_INPUT = '[Open action] Open Input'
const CLOSE_TERMINAL = '[Close action] Close Terminal'

const getLiveUrl = () =>
    (
        process.env.LIVE_WORKER_URL ||
        process.env.WORKER_URL ||
        'https://repo-bot-00.berad4000.workers.dev'
    ).replace(/\/$/, '')

export const initMenu = async (cpy: MenuModel, bal: MenuBit, ste: State) => {
    if (bal.slv != null) rootSlv = bal.slv

    if (!cpy.activeBaseUrl) cpy.activeBaseUrl = getLiveUrl()
    ;(global as any).slackBaseUrl = cpy.activeBaseUrl

    bit = await global.LIBRARY.hunt(UPDATE_GRID, {
        x: 4,
        y: 0,
        xSpan: 8,
        ySpan: 12,
    })
    bit = await global.LIBRARY.hunt(WRITE_CONSOLE, {
        idx: 'cns00',
        src: '',
        dat: { net: bit.grdBit.dat, src: 'slack0' },
    })

    await global.LIBRARY.hunt(UPDATE_CONSOLE, {
        idx: 'cns00',
        src: '-----------',
    })
    await global.LIBRARY.hunt(UPDATE_CONSOLE, {
        idx: 'cns00',
        src: 'SLACK REVIEW BRIDGE & CHATOPS HUD',
    })
    await global.LIBRARY.hunt(UPDATE_CONSOLE, {
        idx: 'cns00',
        src: `ACTIVE TARGET: ${cpy.activeBaseUrl}`,
    })
    await global.LIBRARY.hunt(UPDATE_CONSOLE, {
        idx: 'cns00',
        src: '-----------',
    })

    await updateMenu(cpy, bal, ste)
    return cpy
}

export const updateMenu = async (cpy: MenuModel, bal: MenuBit, ste: State) => {
    const lst = [
        'RUN FULL SLACK SMOKE BATTERY',
        'PROBE URL HANDSHAKE (CHALLENGE)',
        'SIMULATE APPROVE & MERGE (SIGNED)',
        'SIMULATE REJECT & TEARDOWN (SIGNED)',
        'SIMULATE UNAUTHORIZED USER (NEGATIVE)',
        'SIMULATE FORGED SIGNATURE (NEGATIVE)',
        'DISPATCH LIVE CARD TO #ops-bridge',
        'SIMULATE CUSTOM TASK ID...',
        'ROOT MENU',
    ]

    const descriptions: Record<string, string> = {
        'RUN FULL SLACK SMOKE BATTERY':
            'Execute 4-step sequence:\nHandshake, Forged (401), Unauthorized (RBAC), and Approve (200).',
        'PROBE URL HANDSHAKE (CHALLENGE)':
            'Dispatch raw url_verification challenge to verify endpoint reachability.',
        'SIMULATE APPROVE & MERGE (SIGNED)':
            'Submit authentic HMAC-signed Approve button interaction.',
        'SIMULATE REJECT & TEARDOWN (SIGNED)':
            'Submit authentic HMAC-signed Reject button interaction.',
        'SIMULATE UNAUTHORIZED USER (NEGATIVE)':
            'Submit signed click from an unlisted Slack ID to test RBAC rejection.',
        'SIMULATE FORGED SIGNATURE (NEGATIVE)':
            'Submit payload with tampered HMAC to verify 401 fail-closed guard.',
        'DISPATCH LIVE CARD TO #ops-bridge':
            'Send a real Block Kit approval card to the configured Slack channel.',
        'SIMULATE CUSTOM TASK ID...':
            'Open text prompt to simulate decisions against a specific Task ID.',
        'ROOT MENU': 'Return to the main runner menu.',
    }

    bit = await global.LIBRARY.hunt(UPDATE_GRID, {
        x: 0,
        y: 4,
        xSpan: 4,
        ySpan: 8,
    })

    const choiceBit = await global.LIBRARY.hunt(OPEN_CHOICE, {
        dat: {
            clr0: Color.BLACK,
            clr1: Color.YELLOW,
            cb: (choice: string) => {
                const text = descriptions[choice] || 'No description available.'
                text.split('\n').forEach((src) =>
                    global.LIBRARY.hunt(UPDATE_CONSOLE, { idx: 'cns00', src }),
                )
            },
        },
        src: Align.VERTICAL,
        lst,
        net: bit.grdBit.dat,
    })

    const src = choiceBit.chcBit.src

    switch (src) {
        case 'RUN FULL SLACK SMOKE BATTERY':
            await ste.hunt(ActSlack.TEST_SLACK, {})
            await new Promise((r) => setTimeout(r, 2000))
            break

        case 'PROBE URL HANDSHAKE (CHALLENGE)':
            await ste.hunt(ActSlack.PROBE_HANDSHAKE, {})
            await new Promise((r) => setTimeout(r, 2000))
            break

        case 'SIMULATE APPROVE & MERGE (SIGNED)':
            await ste.hunt(ActSlack.SIMULATE_INTERACTION, { src: 'APPROVE' })
            await new Promise((r) => setTimeout(r, 2000))
            break

        case 'SIMULATE REJECT & TEARDOWN (SIGNED)':
            await ste.hunt(ActSlack.SIMULATE_INTERACTION, { src: 'REJECT' })
            await new Promise((r) => setTimeout(r, 2000))
            break

        case 'SIMULATE UNAUTHORIZED USER (NEGATIVE)':
            await ste.hunt(ActSlack.SIMULATE_INTERACTION, {
                src: 'UNAUTHORIZED',
            })
            await new Promise((r) => setTimeout(r, 2000))
            break

        case 'SIMULATE FORGED SIGNATURE (NEGATIVE)':
            await ste.hunt(ActSlack.SIMULATE_INTERACTION, { src: 'FORGED' })
            await new Promise((r) => setTimeout(r, 2000))
            break

        case 'DISPATCH LIVE CARD TO #ops-bridge':
            await ste.hunt(ActSlack.DISPATCH_TEST_CARD, {})
            await new Promise((r) => setTimeout(r, 2500))
            break

        case 'SIMULATE CUSTOM TASK ID...': {
            const inputGrid = await global.LIBRARY.hunt(UPDATE_GRID, {
                x: 0,
                y: 4,
                xSpan: 4,
                ySpan: 4,
            })
            const inputBit = await global.LIBRARY.hunt(OPEN_INPUT, {
                dat: { clr0: Color.BLACK, clr1: Color.YELLOW },
                src: Align.VERTICAL,
                lst: [],
                txt: 'Enter Task ID (e.g. task-04.01)',
                net: inputGrid.grdBit.dat,
            })

            const customTaskId = inputBit.putBit?.src?.trim()
            if (customTaskId) {
                await ste.hunt(ActSlack.SIMULATE_INTERACTION, {
                    src: 'APPROVE',
                    dat: { taskId: customTaskId },
                })
                await new Promise((r) => setTimeout(r, 2000))
            }
            break
        }

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
