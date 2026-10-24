import type { GridModel } from '../grid.model'
import type GridBit from '../fce/grid.bit'
import type State from '../../99.core/state'
import type { TerminalModel } from '../../80.terminal.unit/terminal.model'
import type NetBit from '../fce/net.bit'

export const initGrid = (cpy: GridModel, bal: GridBit, _ste: State) => {
    if (bal?.slv != null) bal.slv({ grdBit: { idx: 'init-grid' } })
    return cpy
}

export const updateGrid = (cpy: GridModel, bal: GridBit, ste: State) => {
    const termMod: TerminalModel | undefined = ste?.value?.terminal

    const margin = 0
    const cols = termMod?.cols && termMod.cols > 0 ? termMod.cols : 12
    const rows = termMod?.rows && termMod.rows > 0 ? termMod.rows : 12

    const colNow = typeof bal?.x === 'number' ? bal.x : 0
    const rowNow = typeof bal?.y === 'number' ? bal.y : 0

    const colSpan = typeof bal?.xSpan === 'number' ? bal.xSpan : 12
    const rowSpan = typeof bal?.ySpan === 'number' ? bal.ySpan : 12

    const spacing = 0

    const cellWidth = (100 - margin * 2) / cols
    const cellHeight = (100 - margin * 2) / rows

    const top = `${rowNow * cellHeight + margin}%`
    const left = `${colNow * cellWidth + margin}%`
    const width = `${cellWidth * colSpan - spacing}%`
    const height = `${cellHeight * rowSpan - spacing}%`

    const bit: NetBit = { left, top, width, height }

    if (bal?.slv != null) bal.slv({ grdBit: { idx: 'update-grid', dat: bit } })

    return cpy
}
