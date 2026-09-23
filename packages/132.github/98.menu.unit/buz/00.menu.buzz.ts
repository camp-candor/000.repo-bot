/* eslint-disable */
import * as ActMnu from '../menu.action.js'
import * as ActOlm from '../../00.github.unit/github.action.js'
import * as ActRepo from '../../02.repo.unit/repo.action.js'

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
const OPEN_INPUT = '[Open action] Open Input'
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
        src: 'GITHUB & REPO CONTROL MENU',
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
    const WATCH_REPO_LABEL = 'WATCH REPOSITORY'
    const LIST_REPOS_LABEL = 'LIST WATCHED REPOS'
    const DELETE_REPO_LABEL = 'DELETE WATCHED REPO'
    const READ_REPO_LABEL = 'INSPECT SPECIFIC REPO'
    const HEALTH_REPO_LABEL = 'AUDIT FLEET CI HEALTH'

    lst = [
        ActOlm.UPDATE_GITHUB.split(']')[1],
        SMOKE_TEST_LABEL,
        WATCH_REPO_LABEL,
        LIST_REPOS_LABEL,
        DELETE_REPO_LABEL,
        READ_REPO_LABEL,
        HEALTH_REPO_LABEL,
        'ROOT MENU',
    ]

    const descriptions: Record<string, string> = {
        [ActOlm.UPDATE_GITHUB.split(']')[1]]: 'Update GitHub configuration.',
        [SMOKE_TEST_LABEL]:
            'Fire negative (401) and positive (202)\nsynthetic signed PR webhook to isolate.',
        [WATCH_REPO_LABEL]:
            'Add a repository to the Durable Object\nwatchlist for continuous tracking.',
        [LIST_REPOS_LABEL]:
            'Display all repositories currently stored\nin the Durable Object watchlist.',
        [DELETE_REPO_LABEL]:
            'Remove a tracked repository from the\nDurable Object watchlist.',
        [READ_REPO_LABEL]:
            'Directly inspect commit and CI checks for a\nsingle repository on demand.',
        [HEALTH_REPO_LABEL]:
            'Audit CI test pass/fail status across the\nentire tracked repository fleet.',
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

        case WATCH_REPO_LABEL: {
            bit = await global.LIBRARY.hunt(UPDATE_GRID, {
                x: 0,
                y: 4,
                xSpan: 4,
                ySpan: 6,
            })
            const inputBit = await global.LIBRARY.hunt(OPEN_INPUT, {
                dat: { clr0: Color.BLACK, clr1: Color.YELLOW },
                src: Align.VERTICAL,
                lst: [],
                txt: 'Enter GitHub Repo URL (e.g. https://github.com/camp-candor/000.server)',
                net: bit.grdBit.dat,
            })
            const inputUrl = inputBit.putBit?.src
            if (inputUrl && inputUrl.trim().length > 0) {
                await ste.hunt(ActRepo.WRITE_REPO, { src: inputUrl.trim() })
                await new Promise((resolve) => setTimeout(resolve, 2000))
            }
            break
        }

        case LIST_REPOS_LABEL:
            await ste.hunt(ActRepo.LIST_REPO, {})
            await new Promise((resolve) => setTimeout(resolve, 2500))
            break

        case DELETE_REPO_LABEL: {
            const listBit = await ste.hunt(ActRepo.LIST_REPO, {})
            const watchedList: string[] = listBit.repoBit?.lst || []

            if (watchedList.length === 0) {
                await global.LIBRARY.hunt(UPDATE_CONSOLE, {
                    idx: 'cns00',
                    src: '>> Watchlist is empty. Nothing to delete.',
                })
                await new Promise((resolve) => setTimeout(resolve, 1500))
                break
            }

            const deleteChoices = [...watchedList, 'CANCEL']
            bit = await global.LIBRARY.hunt(UPDATE_GRID, {
                x: 0,
                y: 4,
                xSpan: 4,
                ySpan: Math.min(12, Math.max(6, deleteChoices.length + 2)),
            })
            const deleteChoiceBit = await global.LIBRARY.hunt(OPEN_CHOICE, {
                dat: { clr0: Color.BLACK, clr1: Color.RED },
                src: Align.VERTICAL,
                lst: deleteChoices,
                net: bit.grdBit.dat,
            })
            const targetToDelete = deleteChoiceBit.chcBit.src

            if (targetToDelete && targetToDelete !== 'CANCEL') {
                await ste.hunt(ActRepo.DELETE_REPO, { src: targetToDelete })
                await new Promise((resolve) => setTimeout(resolve, 2000))
            }
            break
        }

        case READ_REPO_LABEL: {
            const listBit = await ste.hunt(ActRepo.LIST_REPO, {})
            const watchedList: string[] = listBit.repoBit?.lst || []
            const inspectChoices = [...watchedList, 'CUSTOM REPO URL', 'CANCEL']

            bit = await global.LIBRARY.hunt(UPDATE_GRID, {
                x: 0,
                y: 4,
                xSpan: 4,
                ySpan: Math.min(12, Math.max(6, inspectChoices.length + 2)),
            })
            const inspectChoiceBit = await global.LIBRARY.hunt(OPEN_CHOICE, {
                dat: { clr0: Color.BLACK, clr1: Color.YELLOW },
                src: Align.VERTICAL,
                lst: inspectChoices,
                net: bit.grdBit.dat,
            })
            const chosenTarget = inspectChoiceBit.chcBit.src

            if (chosenTarget === 'CANCEL') break

            if (chosenTarget === 'CUSTOM REPO URL') {
                bit = await global.LIBRARY.hunt(UPDATE_GRID, {
                    x: 0,
                    y: 4,
                    xSpan: 4,
                    ySpan: 6,
                })
                const inputBit = await global.LIBRARY.hunt(OPEN_INPUT, {
                    dat: { clr0: Color.BLACK, clr1: Color.YELLOW },
                    src: Align.VERTICAL,
                    lst: [],
                    txt: 'Enter GitHub Repo URL or slug (e.g. slopratchet/000.alligator.ink)',
                    net: bit.grdBit.dat,
                })
                const customTarget = inputBit.putBit?.src
                if (customTarget && customTarget.trim().length > 0) {
                    await ste.hunt(ActRepo.READ_REPO, {
                        src: customTarget.trim(),
                    })
                    await new Promise((resolve) => setTimeout(resolve, 3000))
                }
            } else if (chosenTarget) {
                await ste.hunt(ActRepo.READ_REPO, { src: chosenTarget })
                await new Promise((resolve) => setTimeout(resolve, 3000))
            }
            break
        }

        case HEALTH_REPO_LABEL:
            await ste.hunt(ActRepo.HEALTH_REPO, {})
            await new Promise((resolve) => setTimeout(resolve, 3500))
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
