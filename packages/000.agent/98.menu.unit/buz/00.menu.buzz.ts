/* eslint-disable */
import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import * as ActMnu from '../menu.action.js'
import * as ActOlm from '../../00.agent.unit/agent.action.js'

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
const PRINT_MENU = '[Render action] Print Menu'

export const resolveWorkerDir = (): string => {
    // 1. Check upwards from process.cwd()
    let curr = process.cwd()
    while (curr && curr !== path.dirname(curr)) {
        const candidate = path.join(curr, 'apps', 'worker')
        if (fs.existsSync(candidate)) {
            return candidate
        }
        curr = path.dirname(curr)
    }

    // 2. Check upwards from __dirname if available
    if (typeof __dirname !== 'undefined') {
        let dir = __dirname
        while (dir && dir !== path.dirname(dir)) {
            const candidate = path.join(dir, 'apps', 'worker')
            if (fs.existsSync(candidate)) {
                return candidate
            }
            dir = path.dirname(dir)
        }
    }

    return path.resolve(process.cwd(), 'apps/worker')
}

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
        dat: { net: bit.grdBit.dat, src: 'alligaor0' },
    })

    bit = await global.LIBRARY.hunt(UPDATE_CONSOLE, {
        idx: 'cns00',
        src: '-----------',
    })
    bit = await global.LIBRARY.hunt(UPDATE_CONSOLE, {
        idx: 'cns00',
        src: 'AGENT MENU',
    })
    bit = await global.LIBRARY.hunt(UPDATE_CONSOLE, {
        idx: 'cns00',
        src: '-----------',
    })

    await updateMenu(cpy, bal, ste)
    return cpy
}

export const toggleTargetMode = async (
    cpy: MenuModel,
    bal: MenuBit,
    ste: State,
) => {
    const LOCAL_URL = 'http://127.0.0.1:8787'
    const LIVE_URL =
        process.env.WORKER_URL || 'https://worker-agent.berad4000.workers.dev'

    if (cpy.targetMode === 'LIVE') {
        await global.LIBRARY.hunt(UPDATE_CONSOLE, {
            idx: 'cns00',
            src: '⏳ Spawning local Cloudflare Worker on port 8787...',
        })

        const workerDir = resolveWorkerDir()
        const cmd = process.platform === 'win32' ? 'npx.cmd' : 'npx'
        const child = spawn(
            cmd,
            ['wrangler', 'dev', '--port', '8787', '--ip', '127.0.0.1'],
            {
                cwd: workerDir,
                stdio: 'pipe',
                shell: process.platform === 'win32',
            },
        )

        child.on('error', (err) => {
            if (global.LIBRARY) {
                global.LIBRARY.hunt(UPDATE_CONSOLE, {
                    idx: 'cns00',
                    src: `⚠️ Worker spawn error: ${err.message}`,
                }).catch(() => {})
            }
        })

        cpy.localProcess = child

        let ready = false
        for (let attempt = 1; attempt <= 12; attempt++) {
            await new Promise((resolve) => setTimeout(resolve, 1000))
            try {
                const res = await fetch(`${LOCAL_URL}/health`)
                if (res.status === 200) {
                    ready = true
                    break
                }
            } catch (e) {
                // Waiting for local bundler
            }
        }

        if (ready) {
            cpy.targetMode = 'LOCAL'
            cpy.activeBaseUrl = LOCAL_URL
            ;(global as any).agentBaseUrl = LOCAL_URL
            await global.LIBRARY.hunt(UPDATE_CONSOLE, {
                idx: 'cns00',
                src: `🟢 TARGET SWITCHED: LOCAL (${LOCAL_URL}) [ACTIVE]`,
            })
        } else {
            if (child) {
                try {
                    if (process.platform === 'win32' && child.pid) {
                        const killProc = spawn('taskkill', [
                            '/pid',
                            child.pid.toString(),
                            '/f',
                            '/t',
                        ])
                        killProc.on('error', () => {})
                    } else {
                        child.kill('SIGTERM')
                    }
                } catch (e) {}
            }
            cpy.localProcess = null
            cpy.targetMode = 'LIVE'
            cpy.activeBaseUrl = LIVE_URL
            ;(global as any).agentBaseUrl = LIVE_URL
            await global.LIBRARY.hunt(UPDATE_CONSOLE, {
                idx: 'cns00',
                src: '🔴 FAILED to start local worker. Reverting to LIVE.',
            })
        }
    } else {
        if (cpy.localProcess) {
            try {
                if (process.platform === 'win32' && cpy.localProcess.pid) {
                    const killProc = spawn('taskkill', [
                        '/pid',
                        cpy.localProcess.pid.toString(),
                        '/f',
                        '/t',
                    ])
                    killProc.on('error', () => {})
                } else {
                    cpy.localProcess.kill('SIGTERM')
                }
            } catch (e) {}
            cpy.localProcess = null
        }

        cpy.targetMode = 'LIVE'
        cpy.activeBaseUrl = LIVE_URL
        ;(global as any).agentBaseUrl = LIVE_URL
        await global.LIBRARY.hunt(UPDATE_CONSOLE, {
            idx: 'cns00',
            src: `🌐 TARGET SWITCHED: LIVE (${LIVE_URL}) [ACTIVE]`,
        })
    }

    if (bal?.slv)
        bal.slv({
            mnuBit: { idx: 'toggle-target-mode', dat: cpy.targetMode },
        })
    return cpy
}

export const updateMenu = async (cpy: MenuModel, bal: MenuBit, ste: State) => {
    const toggleLabel =
        cpy.targetMode === 'LIVE'
            ? '🎯 TARGET: [LIVE] -> Switch to LOCAL'
            : '🎯 TARGET: [LOCAL] -> Switch to LIVE'

    const lst = [
        toggleLabel,
        ActOlm.UPDATE_agent.split(']')[1],
        ActOlm.TEST_agent.split(']')[1],
        ActOlm.LIST_agent.split(']')[1],
        'GET / (Health Check)',
        'GET /oracle (The Oracle)',
        'ROOT MENU',
    ]

    bit = await global.LIBRARY.hunt(UPDATE_GRID, {
        x: 0,
        y: 4,
        xSpan: 4,
        ySpan: 8,
    })

    const choiceBit = await global.LIBRARY.hunt(OPEN_CHOICE, {
        dat: {
            clr0: Color.BLACK,
            clr1: cpy.targetMode === 'LOCAL' ? Color.GREEN : Color.YELLOW,
        },
        src: Align.VERTICAL,
        lst,
        net: bit.grdBit.dat,
    })

    const src = choiceBit.chcBit.src

    if (src === toggleLabel) {
        await ste.hunt(ActMnu.TOGGLE_TARGET_MODE, {})
        setTimeout(() => updateMenu(cpy, bal, ste), 300)
        return cpy
    }

    switch (src) {
        case ActOlm.UPDATE_agent.split(']')[1]:
            bit = await ste.hunt(ActOlm.UPDATE_agent, {
                content: 'agent Menu Selected',
            })
            bit = await global.LIBRARY.hunt(PRINT_MENU, bit)
            break

        case ActOlm.TEST_agent.split(']')[1]:
            bit = await ste.hunt(ActOlm.TEST_agent, {
                content: 'agent Menu Selected',
            })
            bit = await global.LIBRARY.hunt(PRINT_MENU, bit)
            break

        case ActOlm.LIST_agent.split(']')[1]:
            bit = await ste.hunt(ActOlm.LIST_agent, {})
            const modelList = bit.olmBit.lst

            if (modelList.length === 0) {
                await global.LIBRARY.hunt(UPDATE_CONSOLE, {
                    idx: 'cns00',
                    src: 'No agent Models Found',
                })
            } else {
                await global.LIBRARY.hunt(UPDATE_CONSOLE, {
                    idx: 'cns00',
                    src: 'Listing agent Models...',
                })
                modelList.forEach((a: string) =>
                    global.LIBRARY.hunt(UPDATE_CONSOLE, {
                        idx: 'cns00',
                        src: a,
                    }),
                )
            }
            await new Promise((resolve) => setTimeout(resolve, 3000))
            break

        case 'GET / (Health Check)':
            await testRoute('/', ste, cpy.activeBaseUrl)
            break

        case 'GET /oracle (The Oracle)':
            await testAiRoute('/oracle', ste, cpy.activeBaseUrl)
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

const testRoute = async (route: string, ste: State, baseUrl: string) => {
    const url = `${baseUrl}${route}`
    await global.LIBRARY.hunt(UPDATE_CONSOLE, {
        idx: 'cns00',
        src: `Fetching: ${url}`,
    })
    try {
        const res = await fetch(url)
        const text = await res.text()
        await global.LIBRARY.hunt(UPDATE_CONSOLE, {
            idx: 'cns00',
            src: `Response:\n${text}`,
        })
    } catch (err: any) {
        await global.LIBRARY.hunt(UPDATE_CONSOLE, {
            idx: 'cns00',
            src: `Error:\n${err.message}`,
        })
    }
    await new Promise((resolve) => setTimeout(resolve, 3000))
}

const testAiRoute = async (route: string, ste: State, baseUrl: string) => {
    const prompts = [
        'Roll a d20',
        'Roll 3 d6',
        'Flip a coin',
        'Tell me a short joke',
    ]

    const gridBit = await global.LIBRARY.hunt(UPDATE_GRID, {
        x: 0,
        y: 4,
        xSpan: 4,
        ySpan: 8,
    })
    const choiceBit = await global.LIBRARY.hunt(OPEN_CHOICE, {
        dat: { clr0: Color.BLACK, clr1: Color.YELLOW },
        src: Align.VERTICAL,
        lst: prompts,
        net: gridBit.grdBit.dat,
    })

    const prompt = choiceBit.chcBit.src
    const url = `${baseUrl}${route}?prompt=${encodeURIComponent(prompt)}`

    await global.LIBRARY.hunt(UPDATE_CONSOLE, {
        idx: 'cns00',
        src: `Fetching: ${url}`,
    })
    try {
        const res = await fetch(url)
        const text = await res.text()
        await global.LIBRARY.hunt(UPDATE_CONSOLE, {
            idx: 'cns00',
            src: `Response:\n${text}`,
        })
    } catch (err: any) {
        await global.LIBRARY.hunt(UPDATE_CONSOLE, {
            idx: 'cns00',
            src: `Error:\n${err.message}`,
        })
    }
    await new Promise((resolve) => setTimeout(resolve, 5000))
}
