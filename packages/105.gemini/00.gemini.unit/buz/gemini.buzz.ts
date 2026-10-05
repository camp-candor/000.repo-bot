import { exec } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { promisify } from 'node:util'

import type { GeminiModel } from '../gemini.model.js'
import type GeminiBit from '../fce/gemini.bit.js'
import type State from '../../99.core/state.js'

const execAsync = promisify(exec)
const UPDATE_CONSOLE = '[Console action] Update Console'

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

export async function focusViaWindowsAHK(
    targetUrl: string,
    delayMs: number,
): Promise<void> {
    const tempScriptPath = path.join(
        os.tmpdir(),
        `gemini_focus_${Date.now()}.ahk`,
    )

    const chromePath = resolveChromePath() || 'chrome.exe'

    const ahkScript = `
#NoEnv
#SingleInstance Force
SetTitleMatchMode, 2

TargetUrl := "${targetUrl}"
Run, "${chromePath}" "%TargetUrl%"

WinWait, Gemini,, 10
if ErrorLevel
{
    WinWait, Google Chrome,, 5
}

WinActivate
WinWaitActive,,, 5

Sleep, ${delayMs}

Send, {Escape}
Sleep, 150
Send, {Tab}
Sleep, 100
Send, ^{End}

ExitApp
`

    await fs.promises.writeFile(tempScriptPath, ahkScript, 'utf8')

    try {
        await execAsync(`AutoHotkey.exe "${tempScriptPath}"`)
    } catch {
        const psFallback = `
$wshell = New-Object -ComObject wscript.shell;
try { Start-Process '${chromePath}' '${targetUrl}' -ErrorAction Stop; } catch { start '${targetUrl}'; }
Start-Sleep -Milliseconds ${delayMs};
try { $wshell.AppActivate('Gemini'); } catch {}
Start-Sleep -Milliseconds 200;
try { $wshell.SendKeys('{TAB}'); } catch {}
`
        await execAsync(
            `powershell -NoProfile -Command "${psFallback.replace(/\n/g, ' ')}"`,
        )
    } finally {
        fs.unlink(tempScriptPath, () => {})
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
        if (ste?.hunt) {
            await ste.hunt(UPDATE_CONSOLE, {
                idx: 'cns00',
                src: `>> [GEMINI] Dispatching browser to notebook URL: ${targetUrl}`,
            })
        }

        const platform = process.platform

        if (platform === 'win32') {
            if (ste?.hunt) {
                await ste.hunt(UPDATE_CONSOLE, {
                    idx: 'cns00',
                    src: '>> [FOCUS] Triggering Win32 automation bridge for input binding...',
                })
            }
            await focusViaWindowsAHK(targetUrl, hydrationDelay)
        } else if (platform === 'darwin') {
            if (ste?.hunt) {
                await ste.hunt(UPDATE_CONSOLE, {
                    idx: 'cns00',
                    src: '>> [FOCUS] Engaging macOS AppleScript process focus...',
                })
            }
            await focusViaDarwinAppleScript(targetUrl, hydrationDelay)
        } else {
            if (ste?.hunt) {
                await ste.hunt(UPDATE_CONSOLE, {
                    idx: 'cns00',
                    src: '>> [LAUNCH] Dispatched Linux browser target via xdg-open',
                })
            }
            await execAsync(`xdg-open "${targetUrl}"`)
        }

        if (ste?.hunt) {
            await ste.hunt(UPDATE_CONSOLE, {
                idx: 'cns00',
                src: '>> [OK] Browser active. Focus asserted on prompt input.',
            })
        }

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
        if (ste?.hunt) {
            try {
                await ste.hunt(UPDATE_CONSOLE, {
                    idx: 'cns00',
                    src: `>> [FAIL] Browser automation error: ${err.message}`,
                })
            } catch {}
        }

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
