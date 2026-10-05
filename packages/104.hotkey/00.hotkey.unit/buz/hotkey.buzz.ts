import { spawn, execSync } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'

import type { HotkeyModel } from '../hotkey.model.js'
import type HotkeyBit from '../fce/hotkey.bit.js'
import type State from '../../99.core/state.js'

const UPDATE_CONSOLE = '[Console action] Update Console'

/**
 * Traverses upward to resolve the repository root.
 */
export function resolveRepoRoot(): string {
    let current = process.cwd()
    while (current && current !== path.dirname(current)) {
        if (
            fs.existsSync(path.join(current, 'apps')) &&
            fs.existsSync(path.join(current, 'packages')) &&
            fs.existsSync(path.join(current, 'package.json'))
        ) {
            return current
        }
        current = path.dirname(current)
    }
    return process.cwd()
}

/**
 * Discovers the host AutoHotkey binary on Windows workstations.
 */
export function resolveAutoHotkeyBinary(): string | null {
    if (process.platform !== 'win32') return null

    const candidates = [
        path.join(
            process.env['ProgramFiles'] || 'C:\\Program Files',
            'AutoHotkey',
            'AutoHotkey.exe',
        ),
        path.join(
            process.env['ProgramFiles'] || 'C:\\Program Files',
            'AutoHotkey',
            'v1.1',
            'AutoHotkeyU64.exe',
        ),
        path.join(
            process.env['ProgramFiles'] || 'C:\\Program Files',
            'AutoHotkey',
            'v2',
            'AutoHotkey64.exe',
        ),
        path.join(
            process.env['LOCALAPPDATA'] || '',
            'Programs',
            'AutoHotkey',
            'AutoHotkey.exe',
        ),
        path.join(
            process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
            'AutoHotkey',
            'AutoHotkey.exe',
        ),
    ]

    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) return candidate
    }

    try {
        const stdout = execSync('where AutoHotkey.exe', {
            stdio: 'pipe',
        }).toString()
        const firstLine = stdout.split('\r\n')[0].trim()
        if (firstLine && fs.existsSync(firstLine)) return firstLine
    } catch {}

    return 'AutoHotkey.exe'
}

/**
 * In-memory default script that centers the cursor on the primary screen.
 */
export const DEFAULT_CENTER_MOUSE_SCRIPT = `; -----------------------------------------------------------------------------
; In-Memory Screen Center Calibration Script
; Piped directly via stdin (AutoHotkey.exe *)
; -----------------------------------------------------------------------------
#NoEnv
#SingleInstance Force
SetBatchLines, -1

CoordMode, Mouse, Screen
CoordMode, ToolTip, Screen

CenterX := A_ScreenWidth // 2
CenterY := A_ScreenHeight // 2

MouseMove, %CenterX%, %CenterY%, 5

ToolTip, >> [HOTKEY] In-Memory Center Calibration (%CenterX%x%CenterY%), %CenterX%, %CenterY%
Sleep, 1200
ToolTip

ExitApp
`

/**
 * Obliterates data/hotkey if present on disk to ensure zero file residue.
 */
export function purgeDiskHotkeyDirectory(): void {
    try {
        const repoRoot = resolveRepoRoot()
        const hotkeyDir = path.join(repoRoot, 'data', 'hotkey')
        if (fs.existsSync(hotkeyDir)) {
            fs.rmSync(hotkeyDir, { recursive: true, force: true })
        }
    } catch {}
}

/**
 * Executes AutoHotkey script completely in memory using stdin pipe.
 */
export function runAhkViaStdin(
    ahkBin: string,
    scriptText: string,
): Promise<void> {
    return new Promise((resolve, reject) => {
        const child = spawn(ahkBin, ['*'], {
            stdio: ['pipe', 'ignore', 'ignore'],
            detached: true,
        })

        child.on('error', (err) => reject(err))

        child.stdin.write(scriptText)
        child.stdin.end()

        child.unref()

        setTimeout(() => resolve(), 300)
    })
}

export const executeHotkey = async (
    cpy: HotkeyModel,
    bal: HotkeyBit,
    ste: State,
): Promise<HotkeyModel> => {
    // 1. Purge legacy disk directory if lingering
    purgeDiskHotkeyDirectory()

    // 2. Resolve script text from payload or default to screen center calibration
    const scriptText = (
        bal?.src ||
        bal?.dat?.script ||
        DEFAULT_CENTER_MOUSE_SCRIPT
    ).trim()

    if (ste?.hunt) {
        await ste.hunt(UPDATE_CONSOLE, {
            idx: 'cns00',
            src: '>> [HOTKEY] Preparing in-memory script execution via stdin pipe...',
        })
    }

    cpy.lastExecutedScript = scriptText

    // 3. Execution Dispatcher
    try {
        if (process.platform === 'win32') {
            const ahkBin = resolveAutoHotkeyBinary() || 'AutoHotkey.exe'

            if (ste?.hunt) {
                await ste.hunt(UPDATE_CONSOLE, {
                    idx: 'cns00',
                    src: `>> [STDIN] Piped script to ${path.basename(ahkBin)} *`,
                })
            }

            await runAhkViaStdin(ahkBin, scriptText)

            if (ste?.hunt) {
                await ste.hunt(UPDATE_CONSOLE, {
                    idx: 'cns00',
                    src: '>> [OK] In-memory script execution complete.',
                })
            }

            if (bal?.slv) {
                bal.slv({
                    htkBit: {
                        idx: 'execute-hotkey-success',
                        src: 'in-memory-stdin',
                        val: 1,
                        dat: { mode: 'STDIN_IN_MEMORY' },
                    },
                })
            }
        } else {
            const mockMsg = `[PLATFORM_BYPASS] Non-Windows OS (${process.platform}): In-memory AutoHotkey execution simulated`
            if (ste?.hunt) {
                await ste.hunt(UPDATE_CONSOLE, {
                    idx: 'cns00',
                    src: `>> ${mockMsg}`,
                })
            }
            if (bal?.slv) {
                bal.slv({
                    htkBit: {
                        idx: 'execute-hotkey-bypassed',
                        src: 'in-memory-stdin',
                        val: 1,
                        dat: {
                            platform: process.platform,
                            mode: 'STDIN_IN_MEMORY',
                        },
                    },
                })
            }
        }
    } catch (err: any) {
        if (ste?.hunt) {
            await ste.hunt(UPDATE_CONSOLE, {
                idx: 'cns00',
                src: `>> [FAIL] In-memory execution error: ${err.message}`,
            })
        }

        if (bal?.slv) {
            bal.slv({
                htkBit: {
                    idx: 'execute-hotkey-error',
                    src: err.message,
                    val: 0,
                },
            })
        }
    }

    return cpy
}

export const initHotkey = (
    cpy: HotkeyModel,
    bal: HotkeyBit,
    _ste: State,
): HotkeyModel => {
    if (bal?.slv) bal.slv({ htkBit: { idx: 'init-hotkey' } })
    return cpy
}

export const updateHotkey = (
    cpy: HotkeyModel,
    bal: HotkeyBit,
    _ste: State,
): HotkeyModel => {
    if (bal?.slv) bal.slv({ htkBit: { idx: 'update-hotkey' } })
    return cpy
}
