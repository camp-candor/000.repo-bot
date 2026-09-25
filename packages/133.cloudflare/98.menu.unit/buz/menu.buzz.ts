/* eslint-disable */
import * as ActMnu from '../menu.action.js'
import * as ActCdf from '../../00.cloudflare.unit/cloudflare.action.js'
import * as ActPgs from '../../03.pages.unit/pages.action.js'
import * as ActWrk from '../../02.workers.unit/workers.action.js'
import * as ActDpl from '../../04.deployment.unit/deployment.action.js'

import type { MenuModel } from '../menu.model.js'
import type MenuBit from '../fce/menu.bit.js'
import type State from '../../99.core/state.js'

import * as Grid from '../../val/grid.js'
import * as Align from '../../val/align.js'
import * as Color from '../../val/console-color.js'

let bit, lst, dat, src
let rootSlv

const UPDATE_GRID = '[Grid action] Update Grid'
const UPDATE_CONSOLE = '[Console action] Update Console'
const OPEN_CHOICE = '[Open action] Open Choice'
const CLOSE_TERMINAL = '[Close action] Close Terminal'
const PRINT_MENU = '[Render action] Print Menu'

var firstLoad = false

export const initMenu = async (cpy: MenuModel, bal: MenuBit, ste: State) => {
    if (bal.slv != null) rootSlv = bal.slv

    bit = await global.LIBRARY.hunt(UPDATE_CONSOLE, {
        idx: 'cns00',
        src: '-----------',
    })
    bit = await global.LIBRARY.hunt(UPDATE_CONSOLE, {
        idx: 'cns00',
        src: 'CLOUDFLARE MENU',
    })

    bit = await global.LIBRARY.hunt(UPDATE_CONSOLE, {
        idx: 'cns00',
        src: '-----------',
    })

    if (firstLoad == false) {
        firstLoad = true

        bit = await ste.hunt(ActCdf.INIT_CLOUDFLARE, {})
    }

    await updateMenu(cpy, bal, ste)

    return cpy
}

export const updateMenu = async (cpy: MenuModel, bal: MenuBit, ste: State) => {
    lst = [
        ActCdf.UPDATE_CLOUDFLARE.split(']')[1],
        ActCdf.TEST_CLOUDFLARE.split(']')[1],
        ActCdf.PROJECT_CLOUDFLARE.split(']')[1],
        ActWrk.SELECT_WORKERS.split(']')[1],
        ActWrk.DELETE_WORKERS.split(']')[1],
        ActPgs.DELETE_PAGES.split(']')[1],
        'DEPLOYMENT MENU',
        'ROOT MENU',
    ]

    const descriptions: { [key: string]: string } = {
        [ActCdf.UPDATE_CLOUDFLARE.split(']')[1]]:
            'Update Cloudflare details\nand manage configuration.',
        [ActCdf.TEST_CLOUDFLARE.split(']')[1]]:
            'Test Cloudflare connection\nand verify setup.',
        [ActCdf.PROJECT_CLOUDFLARE.split(']')[1]]:
            'Manage Cloudflare projects\nincluding workers and pages.',
        [ActWrk.SELECT_WORKERS.split(']')[1]]:
            'Select and configure\nexisting workers.',
        [ActWrk.DELETE_WORKERS.split(']')[1]]:
            'Delete existing workers\nfrom your account.',
        [ActPgs.DELETE_PAGES.split(']')[1]]:
            'Delete existing pages\nfrom your account.',
        'DEPLOYMENT MENU': 'Open the Deployment menu\nto manage deployments.',
        'ROOT MENU': 'Return to the root menu.',
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
                text.split('\n').forEach((src) =>
                    global.LIBRARY.hunt(UPDATE_CONSOLE, {
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
        case ActCdf.UPDATE_CLOUDFLARE.split(']')[1]:
            bit = await ste.hunt(ActCdf.UPDATE_CLOUDFLARE, {
                content: 'Cloudflare Menu Selected',
            })
            bit = await global.LIBRARY.hunt(PRINT_MENU, bit)
            break

        case ActCdf.TEST_CLOUDFLARE.split(']')[1]:
            bit = await ste.hunt(ActCdf.TEST_CLOUDFLARE, {
                content: 'Cloudflare Menu Selected',
            })
            bit = await global.LIBRARY.hunt(PRINT_MENU, bit)
            break

        case ActWrk.SELECT_WORKERS.split(']')[1]:
            bit = await ste.hunt(ActWrk.LIST_WORKERS, {})
            lst = bit.wrkBit.lst

            bit = await global.LIBRARY.hunt(UPDATE_GRID, {
                x: 0,
                y: 4,
                xSpan: 4,
                ySpan: 8,
            })
            bit = await global.LIBRARY.hunt(OPEN_CHOICE, {
                dat: { clr0: Color.BLACK, clr1: Color.YELLOW },
                src: Align.VERTICAL,
                lst,
                net: bit.grdBit.dat,
            })

            src = bit.chcBit.src
            bit = await ste.hunt(ActWrk.SELECT_WORKERS, { idx: src })

            bit = await global.LIBRARY.hunt(UPDATE_CONSOLE, {
                idx: 'cns00',
                src: `Selected worker: ${bit.wrkBit.idx}`,
            })
            await new Promise((resolve) => setTimeout(resolve, 30))
            break

        case ActWrk.DELETE_WORKERS.split(']')[1]:
            bit = await ste.hunt(ActWrk.LIST_WORKERS, {})
            lst = [...bit.wrkBit.lst, 'CANCEL']

            bit = await global.LIBRARY.hunt(UPDATE_GRID, {
                x: 0,
                y: 4,
                xSpan: 4,
                ySpan: 8,
            })
            bit = await global.LIBRARY.hunt(OPEN_CHOICE, {
                dat: { clr0: Color.BLACK, clr1: Color.YELLOW },
                src: Align.VERTICAL,
                lst,
                net: bit.grdBit.dat,
            })

            src = bit.chcBit.src
            if (src === 'CANCEL') {
                bit = await global.LIBRARY.hunt(UPDATE_CONSOLE, {
                    idx: 'cns00',
                    src: 'Cancelled worker deletion.',
                })
                break
            }

            const workerToDelete = src

            bit = await global.LIBRARY.hunt(UPDATE_GRID, {
                x: 0,
                y: 4,
                xSpan: 4,
                ySpan: 8,
            })
            bit = await global.LIBRARY.hunt(OPEN_CHOICE, {
                dat: { clr0: Color.BLACK, clr1: Color.YELLOW },
                src: Align.VERTICAL,
                lst: [`YES, DELETE WORKER: ${workerToDelete}`, 'CANCEL'],
                net: bit.grdBit.dat,
            })

            const confirmSrc = bit.chcBit.src

            if (confirmSrc.startsWith('YES, DELETE WORKER')) {
                bit = await ste.hunt(ActWrk.DELETE_WORKERS, {
                    idx: workerToDelete,
                })

                if (bit.wrkBit.err) {
                    let errMsgs: string[] = []
                    if (Array.isArray(bit.wrkBit.err)) {
                        errMsgs = bit.wrkBit.err.map(
                            (e: any) => e.message || JSON.stringify(e),
                        )
                    } else if (typeof bit.wrkBit.err === 'object') {
                        errMsgs = [
                            (bit.wrkBit.err as any).message ||
                                JSON.stringify(bit.wrkBit.err),
                        ]
                    } else {
                        errMsgs = [String(bit.wrkBit.err)]
                    }

                    bit = await global.LIBRARY.hunt(UPDATE_CONSOLE, {
                        idx: 'cns00',
                        src: `Error deleting worker:`,
                    })
                    for (const msg of errMsgs) {
                        const words = msg.split(' ')
                        let line = '  '
                        for (const word of words) {
                            if (line.length + word.length > 50) {
                                bit = await global.LIBRARY.hunt(
                                    UPDATE_CONSOLE,
                                    { idx: 'cns00', src: line },
                                )
                                line = '    ' + word
                            } else {
                                line +=
                                    (line === '  ' || line === '    '
                                        ? ''
                                        : ' ') + word
                            }
                        }
                        if (line.trim().length > 0) {
                            bit = await global.LIBRARY.hunt(UPDATE_CONSOLE, {
                                idx: 'cns00',
                                src: line,
                            })
                        }
                    }
                } else {
                    bit = await global.LIBRARY.hunt(UPDATE_CONSOLE, {
                        idx: 'cns00',
                        src: `Deleted worker: ${workerToDelete}`,
                    })
                }
            } else {
                bit = await global.LIBRARY.hunt(UPDATE_CONSOLE, {
                    idx: 'cns00',
                    src: `Cancelled deletion of worker: ${workerToDelete}`,
                })
            }

            await new Promise((resolve) => setTimeout(resolve, 30))
            break

        case ActPgs.SELECT_PAGES.split(']')[1]:
            bit = await ste.hunt(ActPgs.LIST_PAGES, {})
            lst = bit.pgsBit.lst

            bit = await global.LIBRARY.hunt(UPDATE_GRID, {
                x: 0,
                y: 4,
                xSpan: 4,
                ySpan: 8,
            })
            bit = await global.LIBRARY.hunt(OPEN_CHOICE, {
                dat: { clr0: Color.BLACK, clr1: Color.YELLOW },
                src: Align.VERTICAL,
                lst,
                net: bit.grdBit.dat,
            })

            src = bit.chcBit.src
            bit = await ste.hunt(ActPgs.SELECT_PAGES, { idx: src })

            bit = await global.LIBRARY.hunt(UPDATE_CONSOLE, {
                idx: 'cns00',
                src: `Selected page: ${bit.pgsBit.idx}`,
            })
            await new Promise((resolve) => setTimeout(resolve, 30))
            break

        case ActPgs.DELETE_PAGES.split(']')[1]:
            bit = await ste.hunt(ActPgs.LIST_PAGES, {})
            lst = [...bit.pgsBit.lst, 'CANCEL']

            bit = await global.LIBRARY.hunt(UPDATE_GRID, {
                x: 0,
                y: 4,
                xSpan: 4,
                ySpan: 8,
            })
            bit = await global.LIBRARY.hunt(OPEN_CHOICE, {
                dat: { clr0: Color.BLACK, clr1: Color.YELLOW },
                src: Align.VERTICAL,
                lst,
                net: bit.grdBit.dat,
            })

            src = bit.chcBit.src
            if (src === 'CANCEL') {
                bit = await global.LIBRARY.hunt(UPDATE_CONSOLE, {
                    idx: 'cns00',
                    src: 'Cancelled page deletion.',
                })
                break
            }

            const targetPageIdx = src

            bit = await global.LIBRARY.hunt(UPDATE_GRID, {
                x: 0,
                y: 4,
                xSpan: 4,
                ySpan: 8,
            })
            bit = await global.LIBRARY.hunt(OPEN_CHOICE, {
                dat: { clr0: Color.BLACK, clr1: Color.YELLOW },
                src: Align.VERTICAL,
                lst: ['YES - DELETE', 'CANCEL'],
                net: bit.grdBit.dat,
            })

            if (bit.chcBit.src === 'YES - DELETE') {
                bit = await ste.hunt(ActPgs.DELETE_PAGES, {
                    idx: targetPageIdx,
                })
                const deleteResult = bit.pgsBit.dat

                if (deleteResult && deleteResult.err) {
                    bit = await global.LIBRARY.hunt(UPDATE_CONSOLE, {
                        idx: 'cns00',
                        src: 'Error: ' + deleteResult.err,
                    })
                } else {
                    bit = await global.LIBRARY.hunt(UPDATE_CONSOLE, {
                        idx: 'cns00',
                        src: `Successfully deleted page: ${targetPageIdx}`,
                    })
                }
            } else {
                bit = await global.LIBRARY.hunt(UPDATE_CONSOLE, {
                    idx: 'cns00',
                    src: 'Deletion cancelled',
                })
            }

            await new Promise((resolve) => setTimeout(resolve, 30))
            break

        case ActCdf.PROJECT_CLOUDFLARE.split(']')[1]:
            bit = await ste.hunt(ActCdf.PROJECT_CLOUDFLARE, {})
            dat = bit?.cdfBit || {}

            if (dat.err != null) {
                bit = await global.LIBRARY.hunt(UPDATE_CONSOLE, {
                    idx: 'cns00',
                    src: 'Error: ' + dat.err,
                })
            } else {
                const workers = dat.lst?.workers || dat.dat?.workers || []
                const pages = dat.lst?.pages || dat.dat?.pages || []

                if (workers.length === 0 && pages.length === 0) {
                    bit = await global.LIBRARY.hunt(UPDATE_CONSOLE, {
                        idx: 'cns00',
                        src: 'No Cloudflare Projects Found',
                    })
                } else {
                    bit = await global.LIBRARY.hunt(UPDATE_CONSOLE, {
                        idx: 'cns00',
                        src: 'Listing Cloudflare Projects...',
                    })
                    if (workers.length > 0) {
                        bit = await global.LIBRARY.hunt(UPDATE_CONSOLE, {
                            idx: 'cns00',
                            src: '--- Workers ---',
                        })
                        workers.forEach((w: any) => {
                            const name =
                                typeof w === 'string'
                                    ? w
                                    : w?.name || w?.id || JSON.stringify(w)
                            global.LIBRARY.hunt(UPDATE_CONSOLE, {
                                idx: 'cns00',
                                src: name,
                            })
                        })
                    }
                    if (pages.length > 0) {
                        bit = await global.LIBRARY.hunt(UPDATE_CONSOLE, {
                            idx: 'cns00',
                            src: '--- Pages ---',
                        })
                        pages.forEach((p: any) => {
                            const name =
                                typeof p === 'string'
                                    ? p
                                    : p?.name || p?.id || JSON.stringify(p)
                            global.LIBRARY.hunt(UPDATE_CONSOLE, {
                                idx: 'cns00',
                                src: name,
                            })
                        })
                    }
                }
            }

            await new Promise((resolve) => setTimeout(resolve, 30))
            break

        case 'DEPLOYMENT MENU':
            bit = await ste.hunt(ActMnu.DEPLOYMENT_MENU, {})
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
