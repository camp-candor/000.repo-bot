import * as ActPut from '../../84.input.unit/input.action'
import * as ActChc from '../../85.choice.unit/choice.action'
import * as ActGrd from '../../81.grid.unit/grid.action'
import * as ActCns from '../../83.console.unit/console.action'
import * as ActMnu from '../../98.menu.unit/menu.action'
import * as ActBus from '../../99.bus.unit/bus.action'
import * as ActTrm from '../terminal.action'

import type { TerminalModel } from '../terminal.model'
import type TerminalBit from '../fce/terminal.bit'
import type State from '../../99.core/state'

import * as Grid from '../../val/grid'

let bit: any
let firstLoad = false

export const initTerminal = async (
    cpy: TerminalModel,
    bal: TerminalBit,
    ste: State,
) => {
    if (firstLoad) return cpy
    firstLoad = true

    if (bal?.dat != null) {
        bit = await ste.hunt(ActBus.INIT_BUS, {
            idx: cpy.idx,
            lst: [ActTrm, ActChc, ActPut, ActGrd, ActCns],
            dat: bal.dat,
            src: bal.src,
        })
    }

    bit = await ste.hunt(ActTrm.OPEN_TERMINAL, {})

    if (bal?.val === 1) patch(ste, ActMnu.INIT_MENU, bal)
    if (bal?.slv != null) bal.slv({ trmBit: { idx: 'init-terminal' } })

    return cpy
}

export const updateTerminal = async (
    cpy: TerminalModel,
    bal: TerminalBit,
    _ste: State,
) => {
    const lstMsg: any[] = []
    if (bal?.slv != null) {
        bal.slv({ trmBit: { idx: 'update-terminal', lst: lstMsg } })
    }
    return cpy
}

export const openTerminal = async (
    cpy: TerminalModel,
    bal: TerminalBit,
    _ste: State,
) => {
    const blessed = (cpy.blessed = require('blessed'))
    cpy.contrib = require('blessed-contrib')
    const screen = (cpy.screen = blessed.screen())

    screen.render()

    if (bal?.slv != null) bal.slv({ trmBit: { idx: 'open-terminal' } })
    return cpy
}

export const closeTerminal = (
    cpy: TerminalModel,
    bal: TerminalBit,
    _ste: State,
) => {
    if (cpy.screen != null) {
        try {
            // Restore standard terminal buffer & unbind raw mode before destroy
            if (typeof cpy.screen.leave === 'function') {
                cpy.screen.leave()
            }
            cpy.screen.destroy()
        } catch {
            // Ignore teardown errors
        }
    }

    cpy.blessed = null
    cpy.contrib = null
    cpy.screen = null

    if (bal?.slv != null) bal.slv({ trmBit: { idx: 'close-terminal' } })
    return cpy
}

export const runTerminal = async (
    cpy: TerminalModel,
    _bal: TerminalBit,
    _ste: State,
) => {
    return cpy
}

export const suspendTerminal = (
    cpy: TerminalModel,
    bal: TerminalBit,
    _ste: State,
) => {
    if (cpy.screen != null) {
        try {
            if (typeof cpy.screen.leave === 'function') {
                cpy.screen.leave()
            }
        } catch {
            // Defensive teardown catch
        }
    }

    if (bal?.slv != null) {
        bal.slv({ trmBit: { idx: 'suspend-terminal' } })
    }
    return cpy
}

export const resumeTerminal = (
    cpy: TerminalModel,
    bal: TerminalBit,
    _ste: State,
) => {
    if (cpy.screen != null) {
        try {
            if (typeof cpy.screen.enter === 'function') {
                cpy.screen.enter()
            }
            if (typeof cpy.screen.realloc === 'function') {
                cpy.screen.realloc()
            }
            if (typeof cpy.screen.render === 'function') {
                cpy.screen.render()
            }
        } catch {
            // Defensive restoration catch
        }
    }

    if (bal?.slv != null) {
        bal.slv({ trmBit: { idx: 'resume-terminal' } })
    }
    return cpy
}

export const editTerminal = (
    cpy: TerminalModel,
    bal: TerminalBit,
    _ste: State,
) => {
    const { spawnSync } = require('child_process')

    const targetFile = bal?.src || ''

    // Resolve editor with automated test/headless fail-safe
    const isTestOrNonInteractive =
        process.env.NODE_ENV === 'test' ||
        process.env.CI === 'true' ||
        !process.stdin.isTTY

    const editor =
        (bal?.dat as any)?.editor ||
        process.env.VISUAL ||
        process.env.EDITOR ||
        (isTestOrNonInteractive
            ? 'node'
            : process.platform === 'win32'
              ? 'notepad'
              : 'vi')

    const defaultArgs =
        editor === 'node' && !(bal?.dat as any)?.args
            ? ['-e', 'process.exit(0)']
            : [targetFile]

    const args = (bal?.dat as any)?.args || defaultArgs
    const screen = cpy.screen
    let suspended = false

    // Step 1: Suspend curses runtime
    if (screen && typeof screen.leave === 'function') {
        try {
            screen.leave()
            suspended = true
        } catch {
            // Non-blocking degradation
        }
    }

    let spawnResult: any = null
    let spawnError: Error | null = null

    try {
        if (!targetFile) {
            throw new Error('No target file provided for editTerminal')
        }

        spawnResult = spawnSync(editor, args, {
            stdio: 'inherit',
            shell: true,
        })
    } catch (err: any) {
        spawnError = err
    } finally {
        // Step 2: Restore curses runtime unconditionally
        if (suspended && screen) {
            try {
                if (typeof screen.enter === 'function') screen.enter()
                if (typeof screen.realloc === 'function') screen.realloc()
                if (typeof screen.render === 'function') screen.render()
            } catch {
                // Ignore restoration errors
            }
        }
    }

    // Step 3: Fulfill bit resolver
    if (bal?.slv != null) {
        if (spawnError) {
            bal.slv({
                trmBit: {
                    idx: 'edit-terminal-error',
                    src: spawnError.message,
                    val: -1,
                },
            })
        } else {
            const exitCode = spawnResult?.status ?? 0
            bal.slv({
                trmBit: {
                    idx:
                        exitCode === 0 ? 'edit-terminal' : 'edit-terminal-fail',
                    src: targetFile,
                    val: exitCode,
                    dat: spawnResult,
                },
            })
        }
    }

    return cpy
}

export const printTerminal = (
    cpy: TerminalModel,
    bal: TerminalBit,
    _ste: State,
) => {
    if (bal?.slv != null) bal.slv({ trmBit: { idx: 'write-terminal' } })
    return cpy
}

export const optionTerminal = (
    cpy: TerminalModel,
    bal: TerminalBit,
    _ste: State,
) => {
    if (bal?.slv != null) bal.slv({ trmBit: { idx: 'option-terminal' } })
    return cpy
}

export const inputTerminal = async (
    cpy: TerminalModel,
    bal: TerminalBit,
    _ste: State,
) => {
    if (bal?.slv != null) bal.slv({ trmBit: { idx: 'input-terminal' } })
    return cpy
}

export const clearTerminal = async (
    cpy: TerminalModel,
    bal: TerminalBit,
    _ste: State,
) => {
    if (cpy.blessed) {
        try {
            cpy.blessed.program().clear()
            if (cpy.screen && typeof cpy.screen.realloc === 'function') {
                cpy.screen.realloc()
            }
        } catch {
            // Ignore clear errors in headless/test runs
        }
    }

    if (bal?.slv != null) bal.slv({ trmBit: { idx: 'clear-terminal' } })
    return cpy
}

export const layoutTerminal = (
    cpy: TerminalModel,
    bal: TerminalBit,
    _ste: State,
) => {
    let fillBit: any

    switch (bal?.src) {
        case Grid.BOT_FULL_IDX:
            fillBit = Grid.BOT_FULL_BIT
            break

        case Grid.MID_FULL_IDX:
            fillBit = Grid.MID_FULL_BIT
            break

        case Grid.TOP_FULL_IDX:
            fillBit = Grid.TOP_FULL_BIT
            break
    }

    if (bal?.slv != null) {
        bal.slv({ trmBit: { idx: 'layout-terminal', dat: fillBit } })
    }
    return cpy
}

const patch = (ste: State, type: string, bale: any) =>
    ste.dispatch({ type, bale })
