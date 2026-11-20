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

export function formatHudBannerFrame(cpy: TerminalModel): string {
    const sessionLabel = (cpy.activePivotTitle || 'MASTER SWITCHBOARD').toUpperCase();
    const seriesLabel = (cpy as any).activeSeriesSlug || 'UNBOUND';
    const sealVal = (cpy as any).canonSealHash || 'UNSEALED';
    const sealPrefix =
        sealVal && sealVal !== 'UNSEALED'
            ? `SEALED (H_root: ${String(sealVal).slice(0, 12)})`
            : 'UNSEALED (LOCAL_DRAFT)';
    const rigLabel = (cpy as any).hostRigRole || 'RIG 1 (ORCHESTRATOR)';

    return [
        `ACTIVE SESSION: [${sessionLabel}] | HOST RIG: ${rigLabel}`,
        `ACTIVE SERIES : ${seriesLabel} | CANON STATUS: ${sealPrefix}`,
    ].join('\n');
}

export const updateTerminal = async (
    cpy: TerminalModel,
    bal: TerminalBit,
    ste?: State,
) => {
    const hudFrame = (cpy as any).hudVisible === false
        ? '[HUD TELEMETRY HIDDEN]'
        : bal?.src && (bal.src as string).trim().length > 0
          ? (bal.src as string).trim()
          : formatHudBannerFrame(cpy);

    (cpy as any).lastRenderedHudFrame = hudFrame;

    if (!ste || typeof (ste as any).hunt !== 'function') {
        if (bal?.slv) {
            bal.slv({
                trmBit: {
                    idx: 'update-terminal-headless',
                    src: hudFrame,
                } as any,
            });
        }
        return cpy;
    }

    try {
        const gridBit = await (ste as any).hunt('[Grid action] Update Grid', {
            x: 4,
            y: 0,
            xSpan: 8,
            ySpan: 3,
        });

        const g = globalThis as Record<string, any>;
        if (g.LIBRARY && typeof g.LIBRARY.hunt === 'function') {
            const hasBoxUnit = Boolean(g.LIBRARY.state?.value?.box) || Boolean(g.LIBRARY.isHeadlessStub);
            if (hasBoxUnit) {
                await g.LIBRARY.hunt('[Box action] Update Box', {
                    idx: 'hud00',
                    src: hudFrame,
                    net: gridBit?.grdBit?.dat,
                });
            }
        }
    } catch {}

    if (bal?.slv != null) {
        bal.slv({ trmBit: { idx: 'update-terminal-ok', src: hudFrame } as any });
    }
    return cpy;
}

export const setSessionContext = async (
    cpy: TerminalModel,
    bal: TerminalBit,
    ste?: State,
) => {
    const payload: any = (bal as any)?.dat && typeof (bal as any).dat === 'object' ? { ...(bal as any).dat, ...(bal as any) } : (bal as any);

    if (typeof payload?.activePivotTitle === 'string' && payload.activePivotTitle.trim().length > 0) {
        (cpy as any).activePivotTitle = payload.activePivotTitle.trim();
    }
    if (typeof payload?.activeSeriesSlug === 'string' && payload.activeSeriesSlug.trim().length > 0) {
        (cpy as any).activeSeriesSlug = payload.activeSeriesSlug.trim();
    }
    if (typeof payload?.canonSealHash === 'string' && payload.canonSealHash.trim().length > 0) {
        (cpy as any).canonSealHash = payload.canonSealHash.trim();
    }
    if (typeof payload?.hostRigRole === 'string' && payload.hostRigRole.trim().length > 0) {
        (cpy as any).hostRigRole = payload.hostRigRole.trim();
    }
    if (typeof payload?.hudVisible === 'boolean') {
        (cpy as any).hudVisible = payload.hudVisible;
    }

    await updateTerminal(cpy, { idx: 'hud-context-sync' } as any, ste as any);

    const pivotName = ((cpy as any).activePivotTitle || 'MASTER SWITCHBOARD').toUpperCase();
    const delimiterBanner = `>> [SESSION: ${pivotName}] Context engaged (series: ${(cpy as any).activeSeriesSlug}, seal: ${String((cpy as any).canonSealHash).slice(0, 12)})...`;

    if (ste && typeof (ste as any).hunt === 'function') {
        try {
            await (ste as any).hunt('[Console action] Update Console', {
                idx: 'cns00',
                src: delimiterBanner,
            });
        } catch {}
    }

    if ((bal as any)?.slv) {
        (bal as any).slv({
            trmBit: {
                idx: 'set-session-context-ok',
                src: delimiterBanner,
                activePivotTitle: (cpy as any).activePivotTitle,
                activeSeriesSlug: (cpy as any).activeSeriesSlug,
                canonSealHash: (cpy as any).canonSealHash,
                hostRigRole: (cpy as any).hostRigRole,
                hudVisible: (cpy as any).hudVisible,
            } as any,
        });
    }

    return cpy;
}

export const openTerminal = async (
    cpy: TerminalModel,
    bal: TerminalBit,
    _ste: State,
) => {
    const blessed = (cpy.blessed = require('blessed'))
    cpy.contrib = require('blessed-contrib')
    if (process.stdin.isTTY && typeof process.stdin.setRawMode === 'function') {
        try {
            process.stdin.setRawMode(true)
        } catch {
            // Non-blocking degradation in test environments
        }
    }

    const screen = (cpy.screen = blessed.screen({
        smartCSR: true,
        title: '995.LIBRARY // TERMINAL FLIGHT DECK',
        cursor: { artificial: true, shape: 'line', blink: true, color: 'green' },
        fullUnicode: false,
        warnings: false,
    }))

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
                    idx: exitCode === 0 ? 'edit-terminal' : 'edit-terminal-fail',
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

        case Grid.CONTROL_AXIS_IDX:
            fillBit = Grid.CONTROL_AXIS_BIT
            break

        case Grid.TELEMETRY_AXIS_IDX:
            fillBit = Grid.TELEMETRY_AXIS_BIT
            break

        case Grid.STATUS_HUD_IDX:
            fillBit = Grid.STATUS_HUD_BIT
            break

        case Grid.CONSOLE_LOG_IDX:
            fillBit = Grid.CONSOLE_LOG_BIT
            break
    }

    if (bal?.slv != null) {
        bal.slv({ trmBit: { idx: 'layout-terminal', dat: fillBit } })
    }
    return cpy
}

const patch = (ste: State, type: string, bale: any) =>
    ste.dispatch({ type, bale })

