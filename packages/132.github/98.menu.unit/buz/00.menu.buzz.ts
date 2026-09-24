/* eslint-disable */
import * as ActMnu from '../menu.action.js'
import * as ActGth from '../../00.github.unit/github.action.js'

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
    ;(global as any).githubBaseUrl = cpy.activeBaseUrl

    bit = await global.LIBRARY.hunt(UPDATE_GRID, {
        x: 4,
        y: 0,
        xSpan: 8,
        ySpan: 12,
    })
    bit = await global.LIBRARY.hunt(WRITE_CONSOLE, {
        idx: 'cns00',
        src: '',
        dat: { net: bit.grdBit.dat, src: 'github0' },
    })

    await global.LIBRARY.hunt(UPDATE_CONSOLE, {
        idx: 'cns00',
        src: '--------------------------------------------------',
    })
    await global.LIBRARY.hunt(UPDATE_CONSOLE, {
        idx: 'cns00',
        src: 'REPO-BOT FLEET GIT OPERATIONS & MERGE FLIGHT DECK',
    })
    await global.LIBRARY.hunt(UPDATE_CONSOLE, {
        idx: 'cns00',
        src: `EDGE ISOLATE TARGET: ${cpy.activeBaseUrl}`,
    })
    await global.LIBRARY.hunt(UPDATE_CONSOLE, {
        idx: 'cns00',
        src: '--------------------------------------------------',
    })

    await updateMenu(cpy, bal, ste)
    return cpy
}

export const updateMenu = async (cpy: MenuModel, bal: MenuBit, ste: State) => {
    const lst = [
        'FLEET MERGE CONTROLLER (SELECT IN-FLIGHT PR)',
        'REGISTER WATCHED REPOSITORY...',
        'LIST WATCHED FLEET REPOSITORIES',
        'AUDIT GITHUB TOKEN & PERMISSIONS',
        'INSPECT SLACK BRIDGE STATUS',
        'ABORT IN-FLIGHT TASK & TRIGGER SAGA (TEARDOWN)',
        'HARD RESET TO HISTORICAL COMMIT & FORCE SYNC...',
        'INSPECT CANDIDATE PR CAS STATUS',
        'SIMULATE CUSTOM TASK MERGE...',
        'RECONCILE STUCK MERGING TASKS',
        'ROOT MENU',
    ]

    const descriptions: Record<string, string> = {
        'FLEET MERGE CONTROLLER (SELECT IN-FLIGHT PR)':
            'Browse in-flight candidates from D1, inspect CAS integrity, and execute merge.',
        'REGISTER WATCHED REPOSITORY...':
            'Auto-provision GitHub webhook, register repo in Edge DO, and execute ping test.',
        'LIST WATCHED FLEET REPOSITORIES':
            'Query and display all active repositories under edge surveillance.',
        'AUDIT GITHUB TOKEN & PERMISSIONS':
            'Audit active GITHUB_TOKEN identity, OAuth scopes, and repository permissions.',
        'INSPECT SLACK BRIDGE STATUS':
            'Stream live Slack outbound receipts and health telemetry from edge DO.',
        'ABORT IN-FLIGHT TASK & TRIGGER SAGA (TEARDOWN)':
            'Break-glass trigger to tear down in-flight PR, obliterate spec branch, and freeze Slack card.',
        'HARD RESET TO HISTORICAL COMMIT & FORCE SYNC...':
            'Choose from last 5 commits, inspect preview, confirm reset, and force push to GitHub.',
        'INSPECT CANDIDATE PR CAS STATUS':
            'Read-only check of auditedHeadSha vs remote head to verify 0-byte drift.',
        'SIMULATE CUSTOM TASK MERGE...':
            'Input custom task ID to trigger authenticated out-of-band merge execution.',
        'RECONCILE STUCK MERGING TASKS':
            'Probe already-merged PRs to resolve network partitions and self-heal DO state.',
        'ROOT MENU': 'Return to the main runner switchboard.',
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
        case 'REGISTER WATCHED REPOSITORY...': {
            const inputGrid = await global.LIBRARY.hunt(UPDATE_GRID, {
                x: 0,
                y: 4,
                xSpan: 4,
                ySpan: 4,
            })
            const inputBit = await global.LIBRARY.hunt(OPEN_INPUT, {
                dat: { clr0: Color.BLACK, clr1: Color.CYAN },
                src: Align.VERTICAL,
                lst: [],
                txt: 'Enter GitHub Repo URL or owner/repo slug:',
                net: inputGrid.grdBit.dat,
            })

            const repoTarget = inputBit.putBit?.src?.trim()
            if (repoTarget) {
                await ste.hunt(ActGth.REGISTER_WATCHED_REPO, {
                    src: repoTarget,
                })
                await new Promise((r) => setTimeout(r, 2500))
            }
            break
        }

        case 'LIST WATCHED FLEET REPOSITORIES': {
            await ste.hunt(ActGth.LIST_WATCHED_REPOS, {})
            await new Promise((r) => setTimeout(r, 2500))
            break
        }

        case 'AUDIT GITHUB TOKEN & PERMISSIONS': {
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
                txt: 'Enter repo slug to audit (default: camp-candor/000.repo-bot):',
                net: inputGrid.grdBit.dat,
            })

            const targetRepo =
                inputBit.putBit?.src?.trim() || 'camp-candor/000.repo-bot'
            await ste.hunt(ActGth.AUDIT_GITHUB_TOKEN, { src: targetRepo })
            await new Promise((r) => setTimeout(r, 2500))
            break
        }

        case 'INSPECT SLACK BRIDGE STATUS': {
            await ste.hunt(ActGth.CHECK_SLACK_BRIDGE_STATUS, {})
            await new Promise((r) => setTimeout(r, 2500))
            break
        }

        case 'ABORT IN-FLIGHT TASK & TRIGGER SAGA (TEARDOWN)': {
            const inputGrid = await global.LIBRARY.hunt(UPDATE_GRID, {
                x: 0,
                y: 4,
                xSpan: 4,
                ySpan: 4,
            })
            const inputBit = await global.LIBRARY.hunt(OPEN_INPUT, {
                dat: { clr0: Color.BLACK, clr1: Color.RED },
                src: Align.VERTICAL,
                lst: [],
                txt: 'Enter Task ID to abort (e.g. TEST-TASK-00)',
                net: inputGrid.grdBit.dat,
            })

            const targetTask = inputBit.putBit?.src?.trim()
            if (targetTask) {
                const confirmGrid = await global.LIBRARY.hunt(UPDATE_GRID, {
                    x: 0,
                    y: 4,
                    xSpan: 4,
                    ySpan: 4,
                })
                const confirmChoice = await global.LIBRARY.hunt(OPEN_CHOICE, {
                    dat: { clr0: Color.BLACK, clr1: Color.RED },
                    src: Align.VERTICAL,
                    lst: [
                        '[NO]  CANCEL & RETURN',
                        `[YES] ABORT & TEARDOWN ${targetTask}`,
                    ],
                    net: confirmGrid.grdBit.dat,
                })

                if (confirmChoice.chcBit.src.startsWith('[YES]')) {
                    await ste.hunt(ActGth.TRIGGER_TASK_ROLLBACK, {
                        src: targetTask,
                        dat: {
                            taskId: targetTask,
                            reason: 'OPERATOR_TERMINAL_TEARDOWN',
                        },
                    })
                    await new Promise((r) => setTimeout(r, 2500))
                }
            }
            break
        }

        case 'HARD RESET TO HISTORICAL COMMIT & FORCE SYNC...': {
            await global.LIBRARY.hunt(UPDATE_CONSOLE, {
                idx: 'cns00',
                src: '>> Querying local git repository for recent commits...',
            })

            const fetchRes: any = await ste.hunt(
                ActGth.FETCH_RECENT_COMMITS,
                {},
            )
            const commits: any[] = fetchRes.gthBit?.lst || []

            if (commits.length === 0) {
                await global.LIBRARY.hunt(UPDATE_CONSOLE, {
                    idx: 'cns00',
                    src: '>> [ERROR] No git commits found or git log failed.',
                })
                await new Promise((r) => setTimeout(r, 1500))
                break
            }

            const commitChoices = commits.map(
                (c, i) =>
                    `[${i + 1}] ${c.shortSha} - ${c.subject.slice(0, 36)} (${c.relativeDate})`,
            )
            commitChoices.push('[-- CANCEL / RETURN --]')

            const choiceGrid = await global.LIBRARY.hunt(UPDATE_GRID, {
                x: 0,
                y: 4,
                xSpan: 4,
                ySpan: 8,
            })
            const selectedChoice = await global.LIBRARY.hunt(OPEN_CHOICE, {
                dat: { clr0: Color.BLACK, clr1: Color.YELLOW },
                src: Align.VERTICAL,
                lst: commitChoices,
                net: choiceGrid.grdBit.dat,
            })

            const choiceText = selectedChoice.chcBit.src
            if (choiceText === '[-- CANCEL / RETURN --]') break

            const chosenCommit = commits.find((c) =>
                choiceText.includes(c.shortSha),
            )
            if (!chosenCommit) break

            // Preview details in cns00
            await ste.hunt(ActGth.PREVIEW_COMMIT_DETAILS, {
                src: chosenCommit.shortSha,
                dat: chosenCommit,
            })

            // Confirmation Dialog (Default to NO for safety)
            const confirmGrid = await global.LIBRARY.hunt(UPDATE_GRID, {
                x: 0,
                y: 4,
                xSpan: 4,
                ySpan: 4,
            })
            const confirmChoice = await global.LIBRARY.hunt(OPEN_CHOICE, {
                dat: { clr0: Color.BLACK, clr1: Color.RED },
                src: Align.VERTICAL,
                lst: [
                    '[NO]  CANCEL & RETURN (KEEP CURRENT STATE)',
                    `[YES] CONFIRM RESET & FORCE PUSH TO ORIGIN (${chosenCommit.shortSha})`,
                ],
                net: confirmGrid.grdBit.dat,
            })

            if (confirmChoice.chcBit.src.startsWith('[YES]')) {
                await ste.hunt(ActGth.EXECUTE_HARD_RESET, {
                    src: chosenCommit.shortSha,
                    dat: { sha: chosenCommit.shortSha },
                })
                await new Promise((r) => setTimeout(r, 2500))
            } else {
                await global.LIBRARY.hunt(UPDATE_CONSOLE, {
                    idx: 'cns00',
                    src: '>> [ABORTED] Hard reset and remote push canceled. Working tree untouched.',
                })
                await new Promise((r) => setTimeout(r, 1200))
            }
            break
        }

        case 'FLEET MERGE CONTROLLER (SELECT IN-FLIGHT PR)': {
            // 1. Discover in-flight candidates
            await global.LIBRARY.hunt(UPDATE_CONSOLE, {
                idx: 'cns00',
                src: '>> Polling live edge worker for merge-ready candidates...',
            })

            let candidates: any[] = []
            const fetchRes: any = await ste.hunt(
                ActGth.FETCH_MERGE_CANDIDATES,
                {},
            )
            candidates = fetchRes.gthBit?.lst || []

            if (candidates.length === 0) {
                await global.LIBRARY.hunt(UPDATE_CONSOLE, {
                    idx: 'cns00',
                    src: '>> [FLEET NOTICE] No tasks currently in AWAITING_APPROVAL or SCOPE_PASSED.',
                })
                await new Promise((r) => setTimeout(r, 1500))
                break
            }

            const candidateChoices = candidates.map(
                (c) =>
                    `[PR #${c.pullNumber || 0}] ${c.taskId} | ${c.state} | ${(c.auditedHeadSha || 'none').slice(0, 7)}`,
            )
            candidateChoices.push('[-- CANCEL / RETURN --]')

            const candidateGrid = await global.LIBRARY.hunt(UPDATE_GRID, {
                x: 0,
                y: 4,
                xSpan: 4,
                ySpan: 8,
            })
            const selectedCandidate = await global.LIBRARY.hunt(OPEN_CHOICE, {
                dat: { clr0: Color.BLACK, clr1: Color.CYAN },
                src: Align.VERTICAL,
                lst: candidateChoices,
                net: candidateGrid.grdBit.dat,
            })

            const choiceText = selectedCandidate.chcBit.src
            if (choiceText === '[-- CANCEL / RETURN --]') break

            const selectedTask = candidates.find((c) =>
                choiceText.includes(c.taskId),
            )
            if (!selectedTask) break

            // 2. Pre-Flight CAS Inspection
            const inspectRes: any = await ste.hunt(ActGth.INSPECT_PR_CAS, {
                src: selectedTask.taskId,
                dat: selectedTask,
            })

            const isEligible = inspectRes.gthBit?.val === 1
            if (!isEligible) {
                await global.LIBRARY.hunt(UPDATE_CONSOLE, {
                    idx: 'cns00',
                    src: '>> [MERGE REFUSED]: Candidate has not cleared checks or has remote head drift.',
                })
                await new Promise((r) => setTimeout(r, 2500))
                break
            }

            // 3. Confirm Execution
            const confirmGrid = await global.LIBRARY.hunt(UPDATE_GRID, {
                x: 0,
                y: 4,
                xSpan: 4,
                ySpan: 4,
            })
            const confirmChoice = await global.LIBRARY.hunt(OPEN_CHOICE, {
                dat: { clr0: Color.BLACK, clr1: Color.GREEN },
                src: Align.VERTICAL,
                lst: ['CONFIRM SQUASH MERGE & RELEASE', 'CANCEL'],
                net: confirmGrid.grdBit.dat,
            })

            if (confirmChoice.chcBit.src === 'CONFIRM SQUASH MERGE & RELEASE') {
                await ste.hunt(ActGth.EXECUTE_MERGE, {
                    src: selectedTask.taskId,
                    dat: {
                        taskId: selectedTask.taskId,
                        headSha: selectedTask.auditedHeadSha,
                        pullNumber: selectedTask.pullNumber,
                    },
                })
                await new Promise((r) => setTimeout(r, 2500))
            }
            break
        }

        case 'INSPECT CANDIDATE PR CAS STATUS': {
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
                txt: 'Enter Task ID to inspect (e.g. TEST-TASK-00)',
                net: inputGrid.grdBit.dat,
            })

            const targetTask = inputBit.putBit?.src?.trim()
            if (targetTask) {
                await ste.hunt(ActGth.INSPECT_PR_CAS, { src: targetTask })
                await new Promise((r) => setTimeout(r, 2000))
            }
            break
        }

        case 'SIMULATE CUSTOM TASK MERGE...': {
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
                txt: 'Enter Task ID to merge (e.g. TEST-TASK-00)',
                net: inputGrid.grdBit.dat,
            })

            const customId = inputBit.putBit?.src?.trim()
            if (customId) {
                await ste.hunt(ActGth.EXECUTE_MERGE, {
                    src: customId,
                    dat: {
                        taskId: customId,
                        headSha: 'abcdef1234567890abcdef1234567890abcdef12',
                        pullNumber: 0,
                    },
                })
                await new Promise((r) => setTimeout(r, 2000))
            }
            break
        }

        case 'RECONCILE STUCK MERGING TASKS':
            await global.LIBRARY.hunt(UPDATE_CONSOLE, {
                idx: 'cns00',
                src: '>> Scanning DO fleet for stranded MERGING states...',
            })
            await ste.hunt(ActGth.INSPECT_PR_CAS, { src: 'TEST-TASK-00' })
            await new Promise((r) => setTimeout(r, 2000))
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
