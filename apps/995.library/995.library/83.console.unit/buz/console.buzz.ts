let bit

import * as ActCns from '../console.action'

import * as ActCol from '../../97.collect.unit/collect.action'

export const initConsole = (cpy: ConsoleModel, bal: ConsoleBit, ste: State) => {
    debugger
    return cpy
}

function wrapConsoleLine(text: string, maxWidth: number): string[] {
    if (!text) return ['']

    // Clamp repeating separator banners (e.g. >> ---- or ====) to maxWidth
    if (/^(?:>>\s*)?[-=_*~]{10,}$/.test(text)) {
        return [text.slice(0, maxWidth)]
    }

    if (text.length <= maxWidth) {
        return [text]
    }

    // Detect indentation/prefix (e.g. ">> ", "• ", "- ", "* ")
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

        // Try to break at a space boundary
        let breakIdx = remaining.lastIndexOf(' ', effectiveMax)
        if (breakIdx <= 0 || breakIdx < effectiveMax * 0.4) {
            // No convenient whitespace boundary; hard break at effectiveMax
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

export const updateConsole = async (
    cpy: ConsoleModel,
    bal: ConsoleBit,
    ste: State,
) => {
    bit = await ste.hunt(ActCns.READ_CONSOLE, { idx: bal.idx })
    const dat: TermBit = bit.cnsBit.dat

    if (bal.src == null) bal.src = ''

    if (dat && dat.bit) {
        const terminal: TerminalModel = ste.value.terminal

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

        const lines = wrapConsoleContent(bal.src, maxWidth)
        for (const line of lines) {
            dat.bit.log(line)
        }

        if (terminal && terminal.screen) {
            terminal.screen.render()
        }
    }

    if (bal.slv != null) bal.slv({ cnsBit: { idx: 'update-console' } })

    return cpy
}

export const createConsole = (
    cpy: ConsoleModel,
    bal: ConsoleBit,
    ste: State,
) => {
    const termMod: TerminalModel = ste.value.terminal

    const contrib = ste.value.terminal.contrib

    const dat: TermBit = { idx: 'hmm', bit: null, clr: null, net: null }

    if (dat.clr == null) dat.clr = COLOR.GREEN

    for (const key in bal.dat) {
        dat[key] = bal.dat[key]
    }

    dat.bit = contrib.log({
        fg: dat.clr,
        selectedFg: dat.clr,
        label: 'Console Log',
        left: dat.net.left,
        top: dat.net.top,
        width: dat.net.width,
        height: dat.net.height,
        bufferLength: 1000,
        scrollable: true,
        alwaysScroll: true,
        keys: true,
        mouse: true,
    })

    const terminal: TerminalModel = ste.value.terminal
    const screen = terminal.screen
    screen.append(dat.bit)

    screen.render()

    if (bal.slv != null) bal.slv({ cnsBit: { idx: 'create-console', dat } })

    return cpy
}

export const readConsole = async (
    cpy: ConsoleModel,
    bal: ConsoleBit,
    ste: State,
) => {
    const slv = bal.slv
    if (bal.idx == null) bal.idx = 'can00'
    bit = await ste.hunt(ActCol.READ_COLLECT, {
        idx: bal.idx,
        bit: ActCns.CREATE_CONSOLE,
    })
    if (slv != null)
        slv({ cnsBit: { idx: 'read-console', dat: bit.clcBit.dat } })

    return cpy
}
export const writeConsole = async (
    cpy: ConsoleModel,
    bal: ConsoleBit,
    ste: State,
) => {
    bit = await ste.hunt(ActCol.WRITE_COLLECT, {
        idx: bal.idx,
        src: bal.src,
        dat: bal.dat,
        bit: ActCns.CREATE_CONSOLE,
    })
    ste.hunt(ActCns.UPDATE_CONSOLE, { idx: bal.idx, src: bal.src })

    if (bal.slv != null)
        bal.slv({ cnsBit: { idx: 'write-console', dat: bit.clcBit.dat } })
    return cpy
}
export const removeConsole = (
    cpy: ConsoleModel,
    bal: ConsoleBit,
    ste: State,
) => {
    debugger
    return cpy
}
export const deleteConsole = (
    cpy: ConsoleModel,
    bal: ConsoleBit,
    ste: State,
) => {
    debugger
    return cpy
}

import type { ConsoleModel } from '../console.model'
import type ConsoleBit from '../fce/console.bit'
import type State from '../../99.core/state'

import type TermBit from '../fce/term.bit'
import type { TerminalModel } from '../../80.terminal.unit/terminal.model'

import * as COLOR from '../../val/console-color'
