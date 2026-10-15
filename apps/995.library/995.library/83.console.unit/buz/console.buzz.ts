import * as ActCns from '../console.action'
import * as ActCol from '../../97.collect.unit/collect.action'
import type { ConsoleModel } from '../console.model'
import type ConsoleBit from '../fce/console.bit'
import type State from '../../99.core/state'
import type TermBit from '../fce/term.bit'
import type { TerminalModel } from '../../80.terminal.unit/terminal.model'
import type { RingBufferQuery } from '../fce/ring-buffer.interface'
import * as COLOR from '../../val/console-color'

let renderScheduled = false

export const initConsole = (
    cpy: ConsoleModel,
    bal: ConsoleBit,
    _ste: State,
) => {
    if (bal?.slv != null) bal.slv({ cnsBit: { idx: 'init-console' } })
    return cpy
}

function wrapConsoleLine(text: string, maxWidth: number): string[] {
    if (!text) return ['']

    if (/^(?:>>\s*)?[-=_*~]{10,}$/.test(text)) {
        return [text.slice(0, maxWidth)]
    }

    if (text.length <= maxWidth) {
        return [text]
    }

    const prefixMatch = text.match(/^(\s*(?:>>|\*|-|•)\s*)/)
    const basePrefix = prefixMatch ? prefixMatch[1] : ''
    const contPrefix = basePrefix.trim() === '>>' ? '>>   ' : '   '

    const lines: string[] = []
    let remaining = text
    let isFirst = true

    while (remaining.length > 0) {
        const currentPrefix = isFirst ? '' : contPrefix
        const effectiveMax = Math.max(10, maxWidth - currentPrefix.length)

        if (remaining.length <= effectiveMax) {
            lines.push(currentPrefix + remaining)
            break
        }

        let breakIdx = remaining.lastIndexOf(' ', effectiveMax)
        if (breakIdx <= 0 || breakIdx < effectiveMax * 0.4) {
            breakIdx = effectiveMax
        }

        const chunk = remaining.slice(0, breakIdx).trimEnd()
        lines.push(currentPrefix + chunk)
        remaining = remaining.slice(breakIdx).trimStart()
        isFirst = false
    }

    return lines
}

function wrapConsoleContent(content: string, maxWidth: number): string[] {
    if (!content) return ['']
    const paragraphs = content.split(/\r?\n/)
    const result: string[] = []
    for (const p of paragraphs) {
        result.push(...wrapConsoleLine(p, maxWidth))
    }
    return result
}

const scheduleScreenRender = (terminal: TerminalModel | undefined) => {
    if (renderScheduled || !terminal?.screen) return
    renderScheduled = true
    setImmediate(() => {
        renderScheduled = false
        if (terminal.screen) {
            terminal.screen.render()
        }
    })
}

export const updateConsole = async (
    cpy: ConsoleModel,
    bal: ConsoleBit,
    ste: State,
) => {
    const textPayload = bal?.src || ''
    const meta = (bal?.dat as any) || {}

    // Ingest into in-memory FIFO Ring Buffer
    if (textPayload && cpy.ring) {
        cpy.ring.push(textPayload, {
            repo: meta.repo,
            stage: meta.stage,
            status: meta.status,
        })
    }

    const bit = await ste?.hunt(ActCns.READ_CONSOLE, {
        idx: bal?.idx || 'cns00',
    })
    const dat: TermBit | undefined = bit?.cnsBit?.dat

    if (dat && dat.bit) {
        const terminal: TerminalModel | undefined = ste?.value?.terminal

        let maxWidth = 48
        if (typeof dat.bit.width === 'number' && dat.bit.width > 4) {
            maxWidth = dat.bit.width - 3
        } else if (
            dat.bit.lpos &&
            typeof dat.bit.lpos.xl === 'number' &&
            typeof dat.bit.lpos.xi === 'number'
        ) {
            const calculated = dat.bit.lpos.xl - dat.bit.lpos.xi - 3
            if (calculated > 10) maxWidth = calculated
        } else if (terminal?.screen?.cols && terminal.screen.cols > 10) {
            maxWidth = Math.max(
                20,
                Math.floor((terminal.screen.cols * 8) / 12) - 3,
            )
        }

        let shouldLog = true
        if (cpy.activeFilter) {
            if (cpy.activeFilter.repo && meta.repo !== cpy.activeFilter.repo)
                shouldLog = false
            else if (
                cpy.activeFilter.stage &&
                meta.stage !== cpy.activeFilter.stage
            )
                shouldLog = false
            else if (
                cpy.activeFilter.status &&
                meta.status !== cpy.activeFilter.status
            )
                shouldLog = false
            else if (cpy.activeFilter.query && textPayload) {
                const clean = textPayload.replace(/[^\x20-\x7E]/g, '').trim()
                if (
                    !clean
                        .toLowerCase()
                        .includes(cpy.activeFilter.query.toLowerCase())
                )
                    shouldLog = false
            }
        }

        if (shouldLog) {
            const lines = wrapConsoleContent(textPayload, maxWidth)
            for (const line of lines) {
                dat.bit.log(line)
            }
            scheduleScreenRender(terminal)
        }
    }

    if (bal?.slv != null) bal.slv({ cnsBit: { idx: 'update-console' } })
    return cpy
}

export const filterConsole = async (
    cpy: ConsoleModel,
    bal: ConsoleBit,
    ste: State,
) => {
    const filterQuery: RingBufferQuery = (bal?.dat as any) || {}
    cpy.activeFilter = filterQuery

    const matchedFrames = cpy.ring.filter(filterQuery)

    const bit = await ste?.hunt(ActCns.READ_CONSOLE, {
        idx: bal?.idx || 'cns00',
    })
    const dat: TermBit | undefined = bit?.cnsBit?.dat

    if (dat && dat.bit) {
        const terminal: TerminalModel | undefined = ste?.value?.terminal
        const logWidget = dat.bit

        // Clear and reload widget viewport in-memory
        if (Array.isArray(logWidget.logLines)) {
            logWidget.logLines = []
        }
        if (typeof logWidget.setItems === 'function') {
            logWidget.setItems([])
        }

        for (const frame of matchedFrames) {
            logWidget.log(frame.clean)
        }

        scheduleScreenRender(terminal)
    }

    if (bal?.slv != null) {
        bal.slv({
            cnsBit: {
                idx: 'filter-console',
                val: matchedFrames.length,
                lst: matchedFrames.map((f) => f.clean),
            },
        })
    }

    return cpy
}

export const createConsole = (
    cpy: ConsoleModel,
    bal: ConsoleBit,
    ste: State,
) => {
    const terminal: TerminalModel | undefined = ste?.value?.terminal
    const contrib = terminal?.contrib
    const screen = terminal?.screen

    const dat: TermBit = {
        idx: bal?.idx || 'cns00',
        bit: null,
        clr: bal?.dat?.clr || COLOR.GREEN,
        net: bal?.dat?.net || null,
    }

    if (contrib && screen) {
        dat.bit = contrib.log({
            fg: dat.clr,
            selectedFg: dat.clr,
            label: 'Console Log',
            left: dat.net?.left ?? '33.33%',
            top: dat.net?.top ?? 0,
            width: dat.net?.width ?? '66.66%',
            height: dat.net?.height ?? '100%',
            bufferLength: 1000,
            scrollable: true,
            alwaysScroll: true,
            keys: true,
            mouse: true,
        })

        screen.append(dat.bit)
        screen.render()
    }

    if (bal?.slv != null) bal.slv({ cnsBit: { idx: 'create-console', dat } })
    return cpy
}

export const readConsole = async (
    cpy: ConsoleModel,
    bal: ConsoleBit,
    ste: State,
) => {
    const slv = bal?.slv
    const targetIdx = bal?.idx || 'can00'
    const bit = await ste?.hunt(ActCol.READ_COLLECT, {
        idx: targetIdx,
        bit: ActCns.CREATE_CONSOLE,
    })
    const resDat = bit?.clcBit?.dat || bit?.colBit?.dat
    if (slv != null) {
        slv({ cnsBit: { idx: 'read-console', dat: resDat } })
    }
    return cpy
}

export const writeConsole = async (
    cpy: ConsoleModel,
    bal: ConsoleBit,
    ste: State,
) => {
    const targetIdx = bal?.idx || 'cns00'
    const bit = await ste?.hunt(ActCol.WRITE_COLLECT, {
        idx: targetIdx,
        src: bal?.src,
        dat: bal?.dat,
        bit: ActCns.CREATE_CONSOLE,
    })
    const resDat = bit?.clcBit?.dat || bit?.colBit?.dat
    await ste?.hunt(ActCns.UPDATE_CONSOLE, {
        idx: targetIdx,
        src: bal?.src,
        dat: bal?.dat,
    })

    if (bal?.slv != null) {
        bal.slv({ cnsBit: { idx: 'write-console', dat: resDat } })
    }
    return cpy
}

export const removeConsole = (
    cpy: ConsoleModel,
    bal: ConsoleBit,
    _ste: State,
) => {
    if (bal?.slv != null) bal.slv({ cnsBit: { idx: 'remove-console' } })
    return cpy
}

export const deleteConsole = (
    cpy: ConsoleModel,
    bal: ConsoleBit,
    _ste: State,
) => {
    if (bal?.slv != null) bal.slv({ cnsBit: { idx: 'delete-console' } })
    return cpy
}
