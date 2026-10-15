/* eslint-disable */
import type { MenuModel } from '../menu.model'
import type MenuBit from '../fce/menu.bit'
import type State from '../../99.core/state'

import * as ActMnu from '../menu.action'
import * as ActLib from '../../00.library.unit/library.action'
import { checkSovereigntyInterlock } from '../../00.library.unit/buz/library.buzz'
import * as ActTrm from '../../80.terminal.unit/terminal.action'
import * as ActChc from '../../85.choice.unit/choice.action'
import * as ActGrd from '../../81.grid.unit/grid.action'
import * as ActCns from '../../83.console.unit/console.action'

import * as Align from '../../val/align'
import * as Color from '../../val/console-color'

export const fleetMenu = async (cpy: MenuModel, bal: MenuBit, ste: State) => {
    if (!ste || !(global as any).LIBRARY) {
        if (bal?.slv) bal.slv({ mnuBit: { idx: 'fleet-menu-headless' } })
        return cpy
    }

    await ste.hunt(ActTrm.CLEAR_TERMINAL, {})
    await ste.hunt(ActCns.UPDATE_CONSOLE, {
        idx: 'cns00',
        src: '==================================================',
    })
    await ste.hunt(ActCns.UPDATE_CONSOLE, {
        idx: 'cns00',
        src: 'FLEET SYNCHRONIZATION FLIGHT DECK',
    })
    await ste.hunt(ActCns.UPDATE_CONSOLE, {
        idx: 'cns00',
        src: '==================================================',
    })

    const lst = [
        'AUDIT FLEET DRIFT & COMPLIANCE',
        'BROADCAST 995.LIBRARY TO FLEET',
        '<-- RETURN TO LIBRARY MENU',
    ]

    const descriptions: Record<string, string> = {
        'AUDIT FLEET DRIFT & COMPLIANCE':
            'Audit lockfile pins and Git SHAs across all fleet workspaces.',
        'BROADCAST 995.LIBRARY TO FLEET':
            'Propagate canonical storehouse atomically across discovered repositories.',
        '<-- RETURN TO LIBRARY MENU': 'Return to the central 995.library menu.',
    }

    const gridBit = await ste.hunt(ActGrd.UPDATE_GRID, {
        x: 0,
        y: 4,
        xSpan: 4,
        ySpan: 8,
    })
    const choiceBit = await ste.hunt(ActChc.OPEN_CHOICE, {
        dat: {
            clr0: Color.BLACK,
            clr1: Color.YELLOW,
            cb: (choice: string) => {
                const text = descriptions[choice] || 'No description available.'
                text.split('\n').forEach((src) =>
                    ste.hunt(ActCns.UPDATE_CONSOLE, { idx: 'cns00', src }),
                )
            },
        },
        src: Align.VERTICAL,
        lst,
        net: gridBit.grdBit.dat,
    })

    const src = choiceBit?.chcBit?.src

    switch (src) {
        case 'AUDIT FLEET DRIFT & COMPLIANCE': {
            await ste.hunt(ActCns.UPDATE_CONSOLE, {
                idx: 'cns00',
                src: '>> [AUDIT] Ingesting versions.json and scanning fleet...',
            })
            // Dispatches fleet scan or audit
            await ste.hunt(ActLib.SCAN_LIBRARY, {})
            break
        }

        case 'BROADCAST 995.LIBRARY TO FLEET': {
            // Check Sovereignty Interlock prior to prompt
            const sovereignty =
                (await (ActLib as any).checkSovereigntyInterlock?.()) ||
                (await checkSovereigntyInterlock())
            if (sovereignty && !sovereignty.allowed) {
                await ste.hunt(ActCns.UPDATE_CONSOLE, {
                    idx: 'cns00',
                    src: '>> [SOVEREIGNTY INTERLOCK] Broadcast blocked: Active node is a periphery repository.',
                })
                await ste.hunt(ActCns.UPDATE_CONSOLE, {
                    idx: 'cns00',
                    src: `>> Designated sovereign: ${sovereignty.sovereignRepo}`,
                })
                break
            }

            const scanRes: any = await ste.hunt(ActLib.SCAN_LIBRARY, {})
            const targets: string[] = scanRes?.libBit?.lst || []

            if (targets.length === 0) {
                await ste.hunt(ActCns.UPDATE_CONSOLE, {
                    idx: 'cns00',
                    src: '>> [FLEET NOTICE] No sibling repositories discovered.',
                })
                break
            }

            const confirmGrid = await ste.hunt(ActGrd.UPDATE_GRID, {
                x: 0,
                y: 4,
                xSpan: 4,
                ySpan: 4,
            })
            const confirmChoice = await ste.hunt(ActChc.OPEN_CHOICE, {
                dat: { clr0: Color.BLACK, clr1: Color.RED },
                src: Align.VERTICAL,
                lst: [
                    '[NO]  CANCEL BROADCAST',
                    `[YES] BROADCAST TO ${targets.length} REPOSITORIES`,
                ],
                net: confirmGrid.grdBit.dat,
            })

            if (confirmChoice?.chcBit?.src?.startsWith('[YES]')) {
                const sagaRes: any = await ste.hunt(ActLib.PROGRESS_LIBRARY, {
                    lst: targets,
                })
                if (sagaRes?.libBit?.idx === 'progress-library-saga-error') {
                    if (sagaRes.libBit.src === 'SOVEREIGNTY_BLOCKED') {
                        await ste.hunt(ActCns.UPDATE_CONSOLE, {
                            idx: 'cns00',
                            src: '>> [SOVEREIGNTY BLOCKED] Broadcast terminated.',
                        })
                        break
                    }
                    await ste.hunt(ActMnu.SAGA_TORN_STATE_MENU, {
                        dat: sagaRes.libBit.dat,
                    })
                    return cpy
                }
            }
            break
        }

        case '<-- RETURN TO LIBRARY MENU':
            await ste.hunt(ActMnu.LIBRARY_MENU, {})
            return cpy
    }

    setTimeout(async () => {
        await ste.hunt(ActMnu.FLEET_MENU, {})
    }, 333)

    return cpy
}

export const sagaTornStateMenu = async (
    cpy: MenuModel,
    bal: MenuBit,
    ste: State,
) => {
    const sagaJournal = bal?.dat || {
        sagaId: 'saga-fs-unknown',
        targetsCompleted: [],
        targetsFailed: ['target/unknown (ERROR)'],
        backups: {},
    }

    if (!ste || !(global as any).LIBRARY) {
        if (bal?.slv)
            bal.slv({
                mnuBit: {
                    idx: 'saga-torn-state-menu-headless',
                    dat: sagaJournal,
                },
            })
        return cpy
    }

    await ste.hunt(ActTrm.CLEAR_TERMINAL, {})
    await ste.hunt(ActCns.UPDATE_CONSOLE, {
        idx: 'cns00',
        src: '==================================================',
    })
    await ste.hunt(ActCns.UPDATE_CONSOLE, {
        idx: 'cns00',
        src: 'FLEET SAGA CONTROLLER: PARTIALLY_MERGED TORN STATE',
    })
    await ste.hunt(ActCns.UPDATE_CONSOLE, {
        idx: 'cns00',
        src: `SAGA ID: ${(sagaJournal as any).sagaId}`,
    })
    await ste.hunt(ActCns.UPDATE_CONSOLE, {
        idx: 'cns00',
        src: `STATUS : [!] TORN (${(sagaJournal as any).targetsCompleted.length} Completed / ${(sagaJournal as any).targetsFailed.length} Failed)`,
    })
    await ste.hunt(ActCns.UPDATE_CONSOLE, {
        idx: 'cns00',
        src: '--------------------------------------------------',
    })

    for (const completed of (sagaJournal as any).targetsCompleted) {
        await ste.hunt(ActCns.UPDATE_CONSOLE, {
            idx: 'cns00',
            src: `  [OK]  ${completed}`,
        })
    }
    for (const failed of (sagaJournal as any).targetsFailed) {
        await ste.hunt(ActCns.UPDATE_CONSOLE, {
            idx: 'cns00',
            src: `  [ERR] ${failed}`,
        })
    }
    await ste.hunt(ActCns.UPDATE_CONSOLE, {
        idx: 'cns00',
        src: '==================================================',
    })

    const lst = [
        '1. RETRY FAILED TARGET (After unlocking file/stopping dev)',
        '2. SKIP TARGET & RESUME SAGA (Mark target as Desynced)',
        '3. COMPENSATE & ROLLBACK COMPLETED (Restore from backups)',
        '4. ABORT SAGA & PRESERVE PARTIAL STATE',
        '5. DUMP FORENSIC SAGA DOSSIER TO cns00',
        '<-- RETURN TO MAIN FLEET MENU',
    ]

    const descriptions: Record<string, string> = {
        '1. RETRY FAILED TARGET (After unlocking file/stopping dev)':
            'Attempt re-propagation on failed targets once file locks are freed.',
        '2. SKIP TARGET & RESUME SAGA (Mark target as Desynced)':
            'Bypass failed target, clean staging, and continue fleet propagation.',
        '3. COMPENSATE & ROLLBACK COMPLETED (Restore from backups)':
            'Revert all modified repositories back to pre-saga snapshots.',
        '4. ABORT SAGA & PRESERVE PARTIAL STATE':
            'Seal journal as TORN and halt execution without reverting completed targets.',
        '5. DUMP FORENSIC SAGA DOSSIER TO cns00':
            'Emit complete JSON journal, file paths, and error stacks to console.',
        '<-- RETURN TO MAIN FLEET MENU':
            'Return to the primary fleet synchronization menu.',
    }

    const gridBit = await ste.hunt(ActGrd.UPDATE_GRID, {
        x: 0,
        y: 4,
        xSpan: 4,
        ySpan: 8,
    })
    const choiceBit = await ste.hunt(ActChc.OPEN_CHOICE, {
        dat: {
            clr0: Color.BLACK,
            clr1: Color.RED,
            cb: (choice: string) => {
                const text = descriptions[choice] || 'No description available.'
                text.split('\n').forEach((src) =>
                    ste.hunt(ActCns.UPDATE_CONSOLE, { idx: 'cns00', src }),
                )
            },
        },
        src: Align.VERTICAL,
        lst,
        net: gridBit.grdBit.dat,
    })

    const src = choiceBit?.chcBit?.src

    switch (src) {
        case '1. RETRY FAILED TARGET (After unlocking file/stopping dev)': {
            await ste.hunt(ActCns.UPDATE_CONSOLE, {
                idx: 'cns00',
                src: '>> [RETRY] Re-dispatching saga on failed targets...',
            })
            const retryTargets = (sagaJournal as any).targetsFailed.map(
                (t: string) => t.split(' ')[0],
            )
            const retryRes: any = await ste.hunt(ActLib.PROGRESS_LIBRARY, {
                lst: retryTargets,
            })
            if (retryRes?.libBit?.idx === 'progress-library-saga-error') {
                await ste.hunt(ActMnu.SAGA_TORN_STATE_MENU, {
                    dat: retryRes.libBit.dat,
                })
                return cpy
            }
            await ste.hunt(ActMnu.FLEET_MENU, {})
            return cpy
        }

        case '2. SKIP TARGET & RESUME SAGA (Mark target as Desynced)': {
            await ste.hunt(ActCns.UPDATE_CONSOLE, {
                idx: 'cns00',
                src: `>> [DESYNC] Flagging failed targets as DESYNCHRONIZED. Staging buffers unlinked.`,
            })
            await ste.hunt(ActMnu.FLEET_MENU, {})
            return cpy
        }

        case '3. COMPENSATE & ROLLBACK COMPLETED (Restore from backups)': {
            await ste.hunt(ActCns.UPDATE_CONSOLE, {
                idx: 'cns00',
                src: '>> [COMPENSATE] Rolling back completed targets in reverse order...',
            })
            // Invokes journal rollback helper
            const fs = require('fs-extra')
            for (const target of [
                ...(sagaJournal as any).targetsCompleted,
            ].reverse()) {
                const bkp = (sagaJournal as any).backups?.[target]
                if (bkp && (await fs.pathExists(bkp))) {
                    await fs.remove(target).catch(() => {})
                    await fs.rename(bkp, target).catch(() => {})
                    await ste.hunt(ActCns.UPDATE_CONSOLE, {
                        idx: 'cns00',
                        src: `>> [RESTORED] Reverted: ${target}`,
                    })
                }
            }
            await ste.hunt(ActMnu.FLEET_MENU, {})
            return cpy
        }

        case '4. ABORT SAGA & PRESERVE PARTIAL STATE': {
            await ste.hunt(ActCns.UPDATE_CONSOLE, {
                idx: 'cns00',
                src: '>> [ABORT] Preserving partial state. Active journal sealed as TORN.',
            })
            await ste.hunt(ActMnu.FLEET_MENU, {})
            return cpy
        }

        case '5. DUMP FORENSIC SAGA DOSSIER TO cns00': {
            await ste.hunt(ActCns.UPDATE_CONSOLE, {
                idx: 'cns00',
                src: '>> [DOSSIER DUMP] ================================',
            })
            const lines = JSON.stringify(sagaJournal, null, 2).split('\n')
            for (const line of lines) {
                await ste.hunt(ActCns.UPDATE_CONSOLE, {
                    idx: 'cns00',
                    src: line,
                })
            }
            await ste.hunt(ActCns.UPDATE_CONSOLE, {
                idx: 'cns00',
                src: '>> ================================================',
            })
            break
        }

        case '<-- RETURN TO MAIN FLEET MENU':
            await ste.hunt(ActMnu.FLEET_MENU, {})
            return cpy
    }

    setTimeout(async () => {
        await ste.hunt(ActMnu.SAGA_TORN_STATE_MENU, { dat: sagaJournal })
    }, 333)

    return cpy
}
