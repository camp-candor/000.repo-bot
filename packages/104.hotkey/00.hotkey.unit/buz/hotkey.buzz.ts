import { spawn, execSync } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'

import type { HotkeyModel } from '../hotkey.model.js'
import type HotkeyBit from '../fce/hotkey.bit.js'
import type State from '../../99.core/state.js'

const UPDATE_CONSOLE = '[Console action] Update Console'

/**
 * Traverses upward to resolve the monorepo root.
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
 * Deterministic default script body for screen center calibration.
 */
export const DEFAULT_000_AHK_BODY = `; -----------------------------------------------------------------------------
; 000..ahk - Auto-generated Default Test Script
; Target: Screen Center Calibration
; -----------------------------------------------------------------------------
#NoEnv
#SingleInstance Force
SetBatchLines, -1

CoordMode, Mouse, Screen
CoordMode, ToolTip, Screen

CenterX := A_ScreenWidth // 2
CenterY := A_ScreenHeight // 2

MouseMove, %CenterX%, %CenterY%, 5

ToolTip, >> [HOTKEY] 000..ahk Calibrated at Center (%CenterX%x%CenterY%), %CenterX%, %CenterY%
Sleep, 1200
ToolTip

ExitApp
`

export const executeHotkey = async (
  cpy: HotkeyModel,
  bal: HotkeyBit,
  ste: State,
): Promise<HotkeyModel> => {
  const repoRoot = resolveRepoRoot()
  const hotkeyDir = path.join(repoRoot, 'data', 'hotkey')

  // 1. Ensure target directory exists
  if (!fs.existsSync(hotkeyDir)) {
    fs.mkdirSync(hotkeyDir, { recursive: true })
    if (ste?.hunt) {
      await ste.hunt(UPDATE_CONSOLE, {
        idx: 'cns00',
        src: '>> [STORAGE] Created missing directory: data/hotkey/',
      })
    }
  }

  // 2. Resolve script filename (default: 000..ahk)
  let scriptName = (bal?.src || bal?.dat?.scriptName || '000..ahk').trim()
  if (!scriptName.endsWith('.ahk')) {
    scriptName = `${scriptName}.ahk`
  }

  const scriptPath = path.join(hotkeyDir, scriptName)

  // 3. Auto-scaffold 000..ahk if missing
  if (!fs.existsSync(scriptPath)) {
    if (scriptName === '000..ahk') {
      fs.writeFileSync(scriptPath, DEFAULT_000_AHK_BODY, 'utf8')
      if (ste?.hunt) {
        await ste.hunt(UPDATE_CONSOLE, {
          idx: 'cns00',
          src: '>> [SCAFFOLD] Created default test script: data/hotkey/000..ahk',
        })
      }
    } else {
      const errorMsg = `Script file not found: data/hotkey/${scriptName}`
      if (ste?.hunt) {
        await ste.hunt(UPDATE_CONSOLE, {
          idx: 'cns00',
          src: `>> [FAIL] ${errorMsg}`,
        })
      }
      if (bal?.slv) {
        bal.slv({
          htkBit: {
            idx: 'execute-hotkey-error',
            src: errorMsg,
            val: 0,
          },
        })
      }
      return cpy
    }
  }

  if (ste?.hunt) {
    await ste.hunt(UPDATE_CONSOLE, {
      idx: 'cns00',
      src: `>> [HOTKEY] Executing: data/hotkey/${scriptName}`,
    })
  }

  cpy.lastExecutedScript = scriptName

  // 4. Execution dispatcher
  try {
    if (process.platform === 'win32') {
      const ahkBin = resolveAutoHotkeyBinary() || 'AutoHotkey.exe'

      await new Promise<void>((resolve, reject) => {
        const child = spawn(ahkBin, [scriptPath], {
          detached: true,
          stdio: 'ignore',
        })

        child.on('error', (err) => reject(err))
        child.unref()

        setTimeout(() => resolve(), 300)
      })

      if (ste?.hunt) {
        await ste.hunt(UPDATE_CONSOLE, {
          idx: 'cns00',
          src: `>> [OK] Dispatched: ${scriptName} (PID active)`,
        })
      }

      if (bal?.slv) {
        bal.slv({
          htkBit: {
            idx: 'execute-hotkey-success',
            src: scriptPath,
            val: 1,
            dat: { scriptName, path: scriptPath },
          },
        })
      }
    } else {
      const mockMsg = `[PLATFORM_BYPASS] Non-Windows OS (${process.platform}): AutoHotkey execution simulated for ${scriptName}`
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
            src: scriptPath,
            val: 1,
            dat: { scriptName, platform: process.platform },
          },
        })
      }
    }
  } catch (err: any) {
    if (ste?.hunt) {
      await ste.hunt(UPDATE_CONSOLE, {
        idx: 'cns00',
        src: `>> [FAIL] Execution error: ${err.message}`,
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
