/* eslint-disable */
import { MenuModel } from '../menu.model'
import MenuBit from '../fce/menu.bit'
import State from '../../99.core/state'

const UPDATE_GRID = '[Grid action] Update Grid'
const WRITE_CONSOLE = '[Write action] Write Console'
const UPDATE_CONSOLE = '[Console action] Update Console'
const OPEN_CHOICE = '[Open action] Open Choice'
const CLOSE_TERMINAL = '[Close action] Close Terminal'
const PRINT_MENU = '[Render action] Print Menu'
import * as ActMnu from '../menu.action.js'
import * as ActPgs from '../../03.pages.unit/pages.action.js'
import * as ActWrk from '../../02.workers.unit/workers.action.js'
import * as ActDpl from '../../04.deployment.unit/deployment.action.js'

import * as Align from '../../val/align.js'
import * as Color from '../../val/console-color.js'

var bit, lst, dex, idx, dat, src

var opened = false

export const deploymentMenu = async (
    cpy: MenuModel,
    bal: MenuBit,
    ste: State,
) => {
    bit = await global.LIBRARY.hunt(UPDATE_CONSOLE, {
        idx: 'cns00',
        src: 'DEPLOYMENT MENU',
    })
    bit = await global.LIBRARY.hunt(UPDATE_CONSOLE, {
        idx: 'cns00',
        src: '-----------',
    })

    lst = [
        ActDpl.LIST_DEPLOYMENT.split(']')[1],
        ActDpl.CURRENT_DEPLOYMENT.split(']')[1],
        ActDpl.DELETE_DEPLOYMENT.split(']')[1],
        ActDpl.WIPE_DEPLOYMENT.split(']')[1],
        ActDpl.TEST_DEPLOYMENT.split(']')[1],
        'ROOT MENU',
    ]

    let rootSlv = bal.slv

    const descriptions: any = {
        [ActDpl.LIST_DEPLOYMENT.split(']')[1]]:
            '-List all available deployments.',
        [ActDpl.CURRENT_DEPLOYMENT.split(']')[1]]:
            '-View the current active deployment.',
        [ActDpl.DELETE_DEPLOYMENT.split(']')[1]]:
            '-Delete a specific deployment.',
        [ActDpl.WIPE_DEPLOYMENT.split(']')[1]]: '-Wipe all deployments.',
        [ActDpl.TEST_DEPLOYMENT.split(']')[1]]: '-Run tests on deployments.',
        'ROOT MENU': '-Return to the root menu.',
    }

    bit = await global.LIBRARY.hunt(UPDATE_GRID, {
        x: 0,
        y: 4,
        xSpan: 4,
        ySpan: 12,
    })
    bit = await global.LIBRARY.hunt(OPEN_CHOICE, {
        dat: {
            clr0: Color.BLACK,
            clr1: Color.YELLOW,
            cb: (choice: string) => {
                const text = descriptions[choice] || 'No description available.'
                text.split('\n').forEach((src) =>
                    ste.hunt(UPDATE_CONSOLE, {
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
        case ActDpl.LIST_DEPLOYMENT.split(']')[1]: {
            bit = await global.LIBRARY.hunt(UPDATE_GRID, {
                x: 0,
                y: 4,
                xSpan: 4,
                ySpan: 8,
            })
            bit = await global.LIBRARY.hunt(OPEN_CHOICE, {
                dat: { clr0: Color.BLACK, clr1: Color.YELLOW },
                src: Align.VERTICAL,
                lst: ['worker', 'page'],
                net: bit.grdBit.dat,
            })

            const deploymentSrc = bit.chcBit.src
            let targetIdx = ''

            // 1. Fetch the data depending on the source type choice
            switch (deploymentSrc) {
                case 'worker':
                    bit = await ste.hunt(ActWrk.LIST_WORKERS, {})
                    lst = bit.wrkBit.lst
                    break
                case 'page':
                    bit = await ste.hunt(ActPgs.LIST_PAGES, {})
                    lst = bit.pgsBit.lst
                    break
            }

            // 2. Open up the selection layout with the relevant unified data list
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

            targetIdx = bit.chcBit.src

            // 4. Pass everything along to list the deployments
            bit = await ste.hunt(ActDpl.LIST_DEPLOYMENT, {
                src: deploymentSrc,
                idx: targetIdx,
            })

            dat = bit.dplBit.dat.deployments || []

            if (dat.err) {
                bit = await global.LIBRARY.hunt(UPDATE_CONSOLE, {
                    idx: 'cns00',
                    src: 'Error: ' + dat.err,
                })
                await new Promise((resolve) => setTimeout(resolve, 300))
            } else if (Array.isArray(dat) && dat.length === 0) {
                bit = await global.LIBRARY.hunt(UPDATE_CONSOLE, {
                    idx: 'cns00',
                    src: 'No deployments found.',
                })
                await new Promise((resolve) => setTimeout(resolve, 300))
            } else if (Array.isArray(dat)) {
                const deploymentIds = dat.map((dpl: any) => {
                    const id = dpl.id || dpl
                    return dpl.isLive ? `${id} (LIVE)` : id
                })

                bit = await global.LIBRARY.hunt(UPDATE_GRID, {
                    x: 0,
                    y: 4,
                    xSpan: 4,
                    ySpan: 8,
                })
                bit = await global.LIBRARY.hunt(OPEN_CHOICE, {
                    dat: { clr0: Color.BLACK, clr1: Color.YELLOW },
                    src: Align.VERTICAL,
                    lst: deploymentIds,
                    net: bit.grdBit.dat,
                })

                const rawSrc = bit.chcBit.src
                const selectedDeploymentId =
                    typeof rawSrc === 'string'
                        ? rawSrc.replace(' (LIVE)', '')
                        : rawSrc

                // 3. Complete the internal core select task based on the source type
                switch (deploymentSrc) {
                    case 'worker':
                        await ste.hunt(ActWrk.SELECT_WORKERS, {
                            idx: selectedDeploymentId,
                        })
                        break
                    case 'page':
                        await ste.hunt(ActPgs.SELECT_PAGES, {
                            idx: selectedDeploymentId,
                        })
                        break
                }

                if (rootSlv != null) {
                    rootSlv({
                        dplBit: {
                            idx: selectedDeploymentId,
                            src: deploymentSrc,
                            targetId: targetIdx,
                        },
                    })
                }
            } else {
                bit = await global.LIBRARY.hunt(UPDATE_CONSOLE, {
                    idx: 'cns00',
                    src: 'Unexpected deployment data.',
                })
                await new Promise((resolve) => setTimeout(resolve, 300))
            }

            break
        }

        case ActDpl.CURRENT_DEPLOYMENT.split(']')[1]: {
            bit = await global.LIBRARY.hunt(UPDATE_GRID, {
                x: 0,
                y: 4,
                xSpan: 4,
                ySpan: 8,
            })
            bit = await global.LIBRARY.hunt(OPEN_CHOICE, {
                dat: { clr0: Color.BLACK, clr1: Color.YELLOW },
                src: Align.VERTICAL,
                lst: ['worker', 'page'],
                net: bit.grdBit.dat,
            })

            const deploymentSrc = bit.chcBit.src
            let targetIdx = ''

            // 1. Fetch the data depending on the source type choice
            switch (deploymentSrc) {
                case 'worker':
                    bit = await ste.hunt(ActWrk.LIST_WORKERS, {})
                    lst = bit.wrkBit.lst
                    break
                case 'page':
                    bit = await ste.hunt(ActPgs.LIST_PAGES, {})
                    lst = bit.pgsBit.lst
                    break
            }

            // 2. Open up the selection layout with the relevant unified data list
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

            targetIdx = bit.chcBit.src

            // 4. Pass everything along to get the current deployment
            bit = await ste.hunt(ActDpl.CURRENT_DEPLOYMENT, {
                src: deploymentSrc,
                idx: targetIdx,
            })

            dat = bit.dplBit.dat || {}

            if (dat.err) {
                bit = await global.LIBRARY.hunt(UPDATE_CONSOLE, {
                    idx: 'cns00',
                    src: 'Error: ' + dat.err,
                })
                await new Promise((resolve) => setTimeout(resolve, 300))
            } else if (dat.idx) {
                bit = await global.LIBRARY.hunt(UPDATE_CONSOLE, {
                    idx: 'cns00',
                    src: JSON.stringify(dat.idx, null, 2),
                })
                await new Promise((resolve) => setTimeout(resolve, 300))
            } else {
                bit = await global.LIBRARY.hunt(UPDATE_CONSOLE, {
                    idx: 'cns00',
                    src: 'Unexpected deployment data.',
                })
                await new Promise((resolve) => setTimeout(resolve, 300))
            }

            break
        }

        case ActDpl.DELETE_DEPLOYMENT.split(']')[1]: {
            bit = await global.LIBRARY.hunt(UPDATE_GRID, {
                x: 0,
                y: 4,
                xSpan: 4,
                ySpan: 8,
            })
            bit = await global.LIBRARY.hunt(OPEN_CHOICE, {
                dat: { clr0: Color.BLACK, clr1: Color.YELLOW },
                src: Align.VERTICAL,
                lst: ['worker', 'page'],
                net: bit.grdBit.dat,
            })

            const deploymentSrc = bit.chcBit.src
            let targetIdx = ''

            switch (deploymentSrc) {
                case 'worker':
                    bit = await ste.hunt(ActWrk.LIST_WORKERS, {})
                    lst = bit.wrkBit.lst
                    break
                case 'page':
                    bit = await ste.hunt(ActPgs.LIST_PAGES, {})
                    lst = bit.pgsBit.lst
                    break
            }

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

            targetIdx = bit.chcBit.src

            bit = await ste.hunt(ActDpl.LIST_DEPLOYMENT, {
                src: deploymentSrc,
                idx: targetIdx,
            })
            const rawDat = bit.dplBit.dat || {}
            dat = rawDat.deployments || []

            if (rawDat.err) {
                bit = await global.LIBRARY.hunt(UPDATE_CONSOLE, {
                    idx: 'cns00',
                    src: 'Error: ' + rawDat.err,
                })
                await new Promise((resolve) => setTimeout(resolve, 30))
            } else if (Array.isArray(dat) && dat.length === 0) {
                bit = await global.LIBRARY.hunt(UPDATE_CONSOLE, {
                    idx: 'cns00',
                    src: 'No deployments found.',
                })
                await new Promise((resolve) => setTimeout(resolve, 30))
            } else if (Array.isArray(dat)) {
                const deploymentIds = dat.map((dpl: any) => {
                    const id = dpl.id || dpl
                    return dpl.isLive ||
                        (typeof dpl.id === 'string' && dpl.id.includes('LIVE:'))
                        ? `LIVE: ${id.replace('LIVE: ', '')}`
                        : id
                })

                bit = await global.LIBRARY.hunt(UPDATE_GRID, {
                    x: 0,
                    y: 4,
                    xSpan: 4,
                    ySpan: 8,
                })
                bit = await global.LIBRARY.hunt(OPEN_CHOICE, {
                    dat: { clr0: Color.BLACK, clr1: Color.YELLOW },
                    src: Align.VERTICAL,
                    lst: deploymentIds,
                    net: bit.grdBit.dat,
                })

                const selectedDeploymentId = bit.chcBit.src

                bit = await ste.hunt(ActDpl.DELETE_DEPLOYMENT, {
                    src: deploymentSrc,
                    idx: targetIdx,
                    dat: { id: selectedDeploymentId },
                })
                const deleteResult = bit.dplBit.dat

                if (deleteResult && deleteResult.err) {
                    bit = await global.LIBRARY.hunt(UPDATE_CONSOLE, {
                        idx: 'cns00',
                        src: 'Error: ' + deleteResult.err,
                    })
                    await new Promise((resolve) => setTimeout(resolve, 30))
                } else {
                    bit = await global.LIBRARY.hunt(UPDATE_CONSOLE, {
                        idx: 'cns00',
                        src: `Successfully deleted deployment. Remaining: ${deleteResult.count}`,
                    })
                    await new Promise((resolve) => setTimeout(resolve, 30))
                }
            } else {
                bit = await global.LIBRARY.hunt(UPDATE_CONSOLE, {
                    idx: 'cns00',
                    src: 'Unexpected deployment data.',
                })
                await new Promise((resolve) => setTimeout(resolve, 30))
            }
            break
        }

        case ActDpl.WIPE_DEPLOYMENT.split(']')[1]: {
            bit = await global.LIBRARY.hunt(UPDATE_GRID, {
                x: 0,
                y: 4,
                xSpan: 4,
                ySpan: 8,
            })
            bit = await global.LIBRARY.hunt(OPEN_CHOICE, {
                dat: { clr0: Color.BLACK, clr1: Color.YELLOW },
                src: Align.VERTICAL,
                lst: ['worker', 'page'],
                net: bit.grdBit.dat,
            })

            const deploymentSrc = bit.chcBit.src
            let targetIdx = ''

            switch (deploymentSrc) {
                case 'worker':
                    bit = await ste.hunt(ActWrk.LIST_WORKERS, {})
                    lst = bit.wrkBit.lst
                    break
                case 'page':
                    bit = await ste.hunt(ActPgs.LIST_PAGES, {})
                    lst = bit.pgsBit.lst
                    break
            }

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

            targetIdx = bit.chcBit.src

            // Wipe Confirmation
            bit = await global.LIBRARY.hunt(UPDATE_GRID, {
                x: 0,
                y: 4,
                xSpan: 4,
                ySpan: 8,
            })
            bit = await global.LIBRARY.hunt(OPEN_CHOICE, {
                dat: { clr0: Color.BLACK, clr1: Color.YELLOW },
                src: Align.VERTICAL,
                lst: ['YES', 'NO'],
                net: bit.grdBit.dat,
            })

            if (bit.chcBit.src === 'YES') {
                bit = await ste.hunt(ActDpl.WIPE_DEPLOYMENT, {
                    src: deploymentSrc,
                    idx: targetIdx,
                })
                const wipeResult = bit.dplBit.dat

                if (wipeResult && wipeResult.err) {
                    bit = await global.LIBRARY.hunt(UPDATE_CONSOLE, {
                        idx: 'cns00',
                        src: 'Error: ' + wipeResult.err,
                    })
                    await new Promise((resolve) => setTimeout(resolve, 30))
                } else {
                    bit = await global.LIBRARY.hunt(UPDATE_CONSOLE, {
                        idx: 'cns00',
                        src: 'Successfully wiped deployments.',
                    })
                    bit = await global.LIBRARY.hunt(UPDATE_CONSOLE, {
                        idx: 'cns00',
                        src: `Del: ${wipeResult.deletedCount}, Err: ${wipeResult.errorCount}, Rem: ${wipeResult.count}`,
                    })
                    await new Promise((resolve) => setTimeout(resolve, 30))
                }
            }
            break
        }

        case ActDpl.TEST_DEPLOYMENT.split(']')[1]:
            bit = await ste.hunt(ActDpl.TEST_DEPLOYMENT, {})
            bit = await global.LIBRARY.hunt(UPDATE_CONSOLE, {
                idx: 'cns00',
                src: JSON.stringify(bit),
            })
            await new Promise((resolve) => setTimeout(resolve, 30))
            break

        case 'ROOT MENU':
            bit = await ste.hunt(ActMnu.UPDATE_MENU, {})
            return cpy

        default:
            bit = await ste.hunt(CLOSE_TERMINAL, {})
            break
    }

    setTimeout(async () => {
        bit = await ste.hunt(ActMnu.DEPLOYMENT_MENU, {})
    }, 333)

    return cpy
}
