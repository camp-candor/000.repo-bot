/* eslint-disable */
import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'
import * as ActMnu from '../menu.action.js'
import * as ActOlm from '../../00.slack.unit/slack.action.js'

import type { MenuModel } from '../menu.model.js'
import type MenuBit from '../fce/menu.bit.js'
import type State from '../../99.core/state.js'

import * as Align from '../../val/align.js'
import * as Color from '../../val/console-color.js'

let bit: any
let rootSlv: any

try {
    let curr = process.cwd()
    while (curr && curr !== path.dirname(curr)) {
        const envCandidate = path.join(curr, '.env')
        if (fs.existsSync(envCandidate)) {
            dotenv.config({ path: envCandidate })
            break
        }
        curr = path.dirname(curr)
    }
} catch (e) {}

const UPDATE_GRID = '[Grid action] Update Grid'
const WRITE_CONSOLE = '[Write action] Write Console'
const UPDATE_CONSOLE = '[Console action] Update Console'
const OPEN_CHOICE = '[Open action] Open Choice'
const CLOSE_TERMINAL = '[Close action] Close Terminal'
const PRINT_MENU = '[Render action] Print Menu'

const getLiveUrl = () =>
    (
        process.env.LIVE_WORKER_URL ||
        process.env.WORKER_URL ||
        'https://repo-bot-00.berad4000.workers.dev'
    ).replace(/\/$/, '')

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

export const resolveRootEnv = (): string | null => {
    let curr = process.cwd()
    while (curr && curr !== path.dirname(curr)) {
        const candidate = path.join(curr, '.env')
        if (fs.existsSync(candidate)) {
            return candidate
        }
        curr = path.dirname(curr)
    }
    return null
}

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
        dat: { net: bit.grdBit.dat, src: 'alligaor0' },
    })

    bit = await global.LIBRARY.hunt(UPDATE_CONSOLE, {
        idx: 'cns00',
        src: '-----------',
    })
    bit = await global.LIBRARY.hunt(UPDATE_CONSOLE, {
        idx: 'cns00',
        src: 'SLACK MENU',
    })
    bit = await global.LIBRARY.hunt(UPDATE_CONSOLE, {
        idx: 'cns00',
        src: `ACTIVE TARGET: [${cpy.targetMode}] ${cpy.activeBaseUrl}`,
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
    const LIVE_URL = getLiveUrl()

    if (cpy.targetMode === 'LIVE') {
        await global.LIBRARY.hunt(UPDATE_CONSOLE, {
            idx: 'cns00',
            src: '>> Spawning local Cloudflare Worker on port 8787...',
        })

        const workerDir = resolveWorkerDir()
        const rootEnv = resolveRootEnv()
        const args = [
            'wrangler',
            'dev',
            '--port',
            '8787',
            '--ip',
            '127.0.0.1',
            '--local',
        ]
        if (rootEnv) {
            args.push('--env-file', rootEnv)
        }

        const cmd = process.platform === 'win32' ? 'npx.cmd' : 'npx'
        const child = spawn(cmd, args, {
            cwd: workerDir,
            stdio: 'pipe',
            shell: process.platform === 'win32',
            env: process.env,
        })

        let stderrData = ''
        child.stderr?.on('data', (chunk) => {
            stderrData += chunk.toString()
        })

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
        for (let attempt = 1; attempt <= 15; attempt++) {
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
            ;(global as any).slackBaseUrl = LOCAL_URL
            await global.LIBRARY.hunt(UPDATE_CONSOLE, {
                idx: 'cns00',
                src: `>> [ONLINE] Local worker is online on [${LOCAL_URL}](${LOCAL_URL})\n>> Ready to receive requests locally.`,
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
            ;(global as any).slackBaseUrl = LIVE_URL
            const errDetail = stderrData.trim()
                ? `\n>> Details: ${stderrData.trim().slice(0, 300)}`
                : ''
            await global.LIBRARY.hunt(UPDATE_CONSOLE, {
                idx: 'cns00',
                src: `>> [FAILED] Local worker timed out after 15s. Reverting to LIVE.${errDetail}`,
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
        ;(global as any).slackBaseUrl = LIVE_URL
        await global.LIBRARY.hunt(UPDATE_CONSOLE, {
            idx: 'cns00',
            src: `>> [SWITCHED] Target set to LIVE (${LIVE_URL})`,
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
            ? 'TARGET: [LIVE] -> Switch to LOCAL'
            : 'TARGET: [LOCAL] -> Switch to LIVE'

    const lst = [
        ActOlm.UPDATE_SLACK.split(']')[1],
        ActOlm.TEST_SLACK.split(']')[1],
        ActOlm.LIST_SLACK.split(']')[1],
        'POST /api/slack/interactions (Handshake)',
        'GET /health (Health Check)',
        'ROOT MENU',
        toggleLabel,
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
        case ActOlm.UPDATE_SLACK.split(']')[1]:
            bit = await ste.hunt(ActOlm.UPDATE_SLACK, {
                content: 'Slack Menu Selected',
            })
            bit = await global.LIBRARY.hunt(PRINT_MENU, bit)
            break

        case ActOlm.TEST_SLACK.split(']')[1]:
            bit = await ste.hunt(ActOlm.TEST_SLACK, {
                content: 'Slack Menu Selected',
            })
            bit = await global.LIBRARY.hunt(PRINT_MENU, bit)
            break

        case ActOlm.LIST_SLACK.split(']')[1]:
            bit = await ste.hunt(ActOlm.LIST_SLACK, {})
            const channelList = bit.olmBit?.lst || []

            if (channelList.length === 0) {
                await global.LIBRARY.hunt(UPDATE_CONSOLE, {
                    idx: 'cns00',
                    src: 'No Slack Channels Found',
                })
            } else {
                await global.LIBRARY.hunt(UPDATE_CONSOLE, {
                    idx: 'cns00',
                    src: 'Listing Slack Channels...',
                })
                channelList.forEach((a: string) =>
                    global.LIBRARY.hunt(UPDATE_CONSOLE, {
                        idx: 'cns00',
                        src: a,
                    }),
                )
            }
            await new Promise((resolve) => setTimeout(resolve, 3000))
            break

        case 'POST /api/slack/interactions (Handshake)':
            await testSlackHandshake(
                '/api/slack/interactions',
                ste,
                cpy.activeBaseUrl,
            )
            break

        case 'GET /health (Health Check)':
            await testRoute('/health', ste, cpy.activeBaseUrl)
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

const formatPayload = (rawText: string) => {
    const trimmed = rawText.trim()
    if (!trimmed) return '   [EMPTY RESPONSE BODY - ISOLATE IDLE]'
    try {
        const parsed = JSON.parse(trimmed)
        return JSON.stringify(parsed, null, 2)
            .split('\n')
            .map((line) => `   ${line}`)
            .join('\n')
    } catch {
        return trimmed
            .split('\n')
            .map((line) => `   ${line}`)
            .join('\n')
    }
}

const testRoute = async (route: string, ste: State, baseUrl: string) => {
    const cleanBase = baseUrl.replace(/\/$/, '')
    const url = `${cleanBase}${route}`

    await global.LIBRARY.hunt(UPDATE_CONSOLE, {
        idx: 'cns00',
        src: `>> [DISPATCH] -> ${url}`,
    })

    const start = Date.now()
    try {
        const res = await fetch(url)
        const duration = Date.now() - start
        const text = await res.text()

        const statusTag = res.ok
            ? `[HTTP ${res.status} OK]`
            : `[HTTP ${res.status} FAIL]`

        await global.LIBRARY.hunt(UPDATE_CONSOLE, {
            idx: 'cns00',
            src: '>> ==================================================',
        })
        await global.LIBRARY.hunt(UPDATE_CONSOLE, {
            idx: 'cns00',
            src: `>> ${statusTag} :: ${duration}ms RTT :: EDGE REACHED`,
        })
        await global.LIBRARY.hunt(UPDATE_CONSOLE, {
            idx: 'cns00',
            src: '>> --------------------------------------------------',
        })
        await global.LIBRARY.hunt(UPDATE_CONSOLE, {
            idx: 'cns00',
            src: formatPayload(text),
        })
        await global.LIBRARY.hunt(UPDATE_CONSOLE, {
            idx: 'cns00',
            src: '>> ==================================================',
        })
    } catch (err: any) {
        const duration = Date.now() - start
        await global.LIBRARY.hunt(UPDATE_CONSOLE, {
            idx: 'cns00',
            src: `>> [CONN_ERROR] (${duration}ms): ${err.message}`,
        })
    }
    await new Promise((resolve) => setTimeout(resolve, 3000))
}

const testSlackHandshake = async (
    route: string,
    ste: State,
    baseUrl: string,
) => {
    const cleanBase = baseUrl.replace(/\/$/, '')
    const url = `${cleanBase}${route}`

    await global.LIBRARY.hunt(UPDATE_CONSOLE, {
        idx: 'cns00',
        src: `>> [SLACK PROBE] -> ${url}`,
    })

    const challengeToken = `slack-handshake-probe-${Date.now()}`
    const start = Date.now()
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'url_verification',
                challenge: challengeToken,
            }),
        })
        const duration = Date.now() - start
        const text = await res.text()

        const statusTag = res.ok
            ? `[HTTP ${res.status} OK]`
            : `[HTTP ${res.status} FAIL]`

        await global.LIBRARY.hunt(UPDATE_CONSOLE, {
            idx: 'cns00',
            src: '>> ==================================================',
        })
        await global.LIBRARY.hunt(UPDATE_CONSOLE, {
            idx: 'cns00',
            src: `>> ${statusTag} :: ${duration}ms RTT :: SLACK CHALLENGE HANDSHAKE`,
        })
        await global.LIBRARY.hunt(UPDATE_CONSOLE, {
            idx: 'cns00',
            src: '>> --------------------------------------------------',
        })
        await global.LIBRARY.hunt(UPDATE_CONSOLE, {
            idx: 'cns00',
            src: formatPayload(text),
        })
        await global.LIBRARY.hunt(UPDATE_CONSOLE, {
            idx: 'cns00',
            src: '>> ==================================================',
        })
    } catch (err: any) {
        const duration = Date.now() - start
        await global.LIBRARY.hunt(UPDATE_CONSOLE, {
            idx: 'cns00',
            src: `>> [SLACK_PROBE_ERROR] (${duration}ms): ${err.message}`,
        })
    }
    await new Promise((resolve) => setTimeout(resolve, 3000))
}
