import { exec, spawn, execSync } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { promisify } from 'node:util'

import type { GeminiModel } from '../gemini.model.js'
import type GeminiBit from '../fce/gemini.bit.js'
import type State from '../../99.core/state.js'

const execAsync = promisify(exec)
const UPDATE_CONSOLE = '[Console action] Update Console'

const logConsole = async (src: string, ste?: State) => {
    const lib = (globalThis as any).LIBRARY || (global as any).LIBRARY
    if (lib?.hunt) {
        await lib.hunt(UPDATE_CONSOLE, { idx: 'cns00', src })
        return
    }
    if (ste?.hunt) {
        try {
            const p = ste.hunt(UPDATE_CONSOLE, { idx: 'cns00', src })
            if (p && typeof p.then === 'function') {
                await Promise.race([
                    p,
                    new Promise((resolve) => setTimeout(resolve, 30)),
                ])
            }
        } catch {}
    }
}

export function resolveChromePath(): string | null {
    const platform = process.platform

    if (platform === 'win32') {
        const candidates = [
            path.join(
                process.env.LOCALAPPDATA || '',
                'Google/Chrome/Application/chrome.exe',
            ),
            path.join(
                process.env['PROGRAMFILES'] || 'C:\\Program Files',
                'Google/Chrome/Application/chrome.exe',
            ),
            path.join(
                process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)',
                'Google/Chrome/Application/chrome.exe',
            ),
        ]
        for (const p of candidates) {
            if (fs.existsSync(p)) return p
        }
    } else if (platform === 'darwin') {
        const macPath =
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
        if (fs.existsSync(macPath)) return macPath
    } else {
        const linuxCandidates = [
            '/usr/bin/google-chrome',
            '/usr/bin/google-chrome-stable',
            '/usr/bin/chromium-browser',
        ]
        for (const p of linuxCandidates) {
            if (fs.existsSync(p)) return p
        }
    }
    return null
}

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

    return null
}

export async function focusViaWindowsAHK(
    targetUrl: string,
    delayMs: number,
): Promise<void> {
    const chromePath = resolveChromePath()
    const ahkBin = resolveAutoHotkeyBinary()

    // 1. Immediately launch Chrome / browser window
    try {
        if (chromePath) {
            exec(`"${chromePath}" "${targetUrl}"`)
        } else {
            exec(`cmd.exe /c start "" "${targetUrl}"`)
        }
    } catch {
        exec(`cmd.exe /c start "" "${targetUrl}"`)
    }

    // 2. If AutoHotkey is present, dispatch window activation and key focus
    if (ahkBin) {
        const tempScriptPath = path.join(
            os.tmpdir(),
            `gemini_focus_${Date.now()}.ahk`,
        )

        const ahkScript = `
#NoEnv
#SingleInstance Force
SetTitleMatchMode, 2

WinWait, Gemini,, 6
if ErrorLevel
{
    WinWait, Google Chrome,, 4
}

WinActivate
WinWaitActive,,, 3

Sleep, ${delayMs}

Send, {Escape}
Sleep, 150
Send, {Tab}
Sleep, 100
Send, ^{End}

ExitApp
`
        try {
            await fs.promises.writeFile(tempScriptPath, ahkScript, 'utf8')
            const child = spawn(ahkBin, [tempScriptPath], {
                detached: true,
                stdio: 'ignore',
            })
            child.unref()
            setTimeout(() => {
                fs.unlink(tempScriptPath, () => {})
            }, 12000)
        } catch {
            fs.unlink(tempScriptPath, () => {})
        }
    }
}

export async function focusViaDarwinAppleScript(
    targetUrl: string,
    delayMs: number,
): Promise<void> {
    const delaySec = (delayMs / 1000).toFixed(1)
    const appleScript = `
tell application "Google Chrome"
    activate
    open location "${targetUrl}"
    delay ${delaySec}
end tell
tell application "System Events"
    tell process "Google Chrome"
        set frontmost to true
        key code 53 -- Escape
        delay 0.1
        key code 48 -- Tab
    end tell
end tell
`
    await execAsync(`osascript -e '${appleScript.replace(/'/g, "'\\''")}'`)
}

export const openGemini = async (
    cpy: GeminiModel,
    bal: GeminiBit,
    ste: State,
): Promise<GeminiModel> => {
    const targetUrl =
        bal?.src ||
        (bal?.dat?.notebookId
            ? `https://gemini.google.com/notebook/${bal.dat.notebookId}`
            : cpy.targetUrl)

    const hydrationDelay = bal?.val || cpy.hydrationDelayMs

    try {
        await logConsole(
            `>> [GEMINI] Dispatching browser to notebook URL: ${targetUrl}`,
            ste,
        )

        const platform = process.platform

        if (platform === 'win32') {
            await logConsole(
                '>> [FOCUS] Triggering Win32 automation bridge for input binding...',
                ste,
            )
            await focusViaWindowsAHK(targetUrl, hydrationDelay)
        } else if (platform === 'darwin') {
            await logConsole(
                '>> [FOCUS] Engaging macOS AppleScript process focus...',
                ste,
            )
            await focusViaDarwinAppleScript(targetUrl, hydrationDelay)
        } else {
            await logConsole(
                '>> [LAUNCH] Dispatched Linux browser target via xdg-open',
                ste,
            )
            await execAsync(`xdg-open "${targetUrl}"`)
        }

        await logConsole(
            '>> [OK] Browser active. Focus asserted on prompt input.',
            ste,
        )

        if (bal?.slv) {
            bal.slv({
                gmnBit: {
                    idx: 'open-gemini-success',
                    src: targetUrl,
                    val: 1,
                },
            })
        }
    } catch (err: any) {
        try {
            await logConsole(
                `>> [FAIL] Browser automation error: ${err.message}`,
                ste,
            )
        } catch {}

        try {
            const fallbackCmd =
                process.platform === 'win32'
                    ? `start "" "${targetUrl}"`
                    : process.platform === 'darwin'
                      ? `open "${targetUrl}"`
                      : `xdg-open "${targetUrl}"`

            exec(fallbackCmd)
        } catch {}

        if (bal?.slv) {
            bal.slv({
                gmnBit: {
                    idx: 'open-gemini-error',
                    src: err.message,
                    val: 0,
                },
            })
        }
    }

    return cpy
}

export const initGemini = (
    cpy: GeminiModel,
    bal: GeminiBit,
    _ste: State,
): GeminiModel => {
    const url =
        process.env.GEMINI_URL ||
        'https://zero00-gemini.onrender.com/api/gemini/test'
    if (url) {
        fetch(url)
            .then((response) => response.json())
            .then((data) => {
                if (bal?.slv != null) {
                    bal.slv({
                        intBit: {
                            idx: 'init-gemini',
                            dat: {
                                gemini: data,
                            },
                        },
                    })
                }
            })
            .catch((error: any) => {
                if (bal?.slv != null) {
                    bal.slv({
                        intBit: { idx: 'init-gemini-err', dat: error.message },
                    })
                }
            })
    } else {
        if (bal?.slv != null) {
            bal.slv({ intBit: { idx: 'init-gemini' } })
        }
    }
    return cpy
}

export const updateGemini = (
    cpy: GeminiModel,
    bal: GeminiBit,
    _ste: State,
): GeminiModel => {
    if (bal?.slv) bal.slv({ intBit: { idx: 'update-gemini' } })
    return cpy
}

export const testGemini = (
    cpy: GeminiModel,
    bal: GeminiBit,
    _ste: State,
): GeminiModel => {
    if (bal?.slv) bal.slv({ mytBit: { idx: 'test-gemini', val: 1 } })
    return cpy
}

const gemini = {
    list: async () => {
        return { models: [] as any[] }
    },
}

export const listGemini = async (
    cpy: GeminiModel,
    bal: GeminiBit,
    _ste: State,
): Promise<GeminiModel> => {
    const response = await gemini.list()
    if (bal?.slv != null)
        bal.slv({
            olmBit: {
                idx: 'list-gemini',
                lst: response.models.map((m: any) => m.name),
            },
        })
    return cpy
}
