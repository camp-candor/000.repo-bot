import type { InputModel } from '../input.model'
import type InputBit from '../fce/input.bit'
import type State from '../../99.core/state'
import type NetBit from '../../81.grid.unit/fce/net.bit'
import * as Color from '../../val/console-color'

export const initInput = (cpy: InputModel, bal: InputBit, _ste: State) => {
    if (bal?.slv != null) bal.slv({ putBit: { idx: 'init-input' } })
    return cpy
}

export const updateInput = (cpy: InputModel, bal: InputBit, _ste: State) => {
    if (bal?.slv != null) bal.slv({ putBit: { idx: 'update-input' } })
    return cpy
}

export const openInput = (cpy: InputModel, bal: InputBit, ste: State) => {
    const terminal = ste?.value?.terminal
    const blessed = terminal?.blessed
    const screen = terminal?.screen

    if (!screen || !blessed) {
        if (bal?.slv != null) {
            bal.slv({
                putBit: { idx: 'open-input-headless', src: bal?.src || '' },
            })
        }
        return cpy
    }

    const dat = {
        idx: 'input-bit',
        clr0: Color.GREEN,
        clr1: Color.CYAN,
        ...(bal?.dat || {}),
    }

    const net: NetBit = bal?.net || {
        left: 0,
        top: 0,
        width: '100%',
        height: 3,
    }

    const labelText = bal?.txt || 'input below'

    const title = blessed.textbox({
        parent: screen,
        name: 'input-title',
        keys: true,
        left: net.left,
        top: 1,
        width: net.width,
        height: 2,
        content: 'rename',
        border: { type: 'line' },
        label: labelText,
    })

    const input = blessed.textbox({
        parent: screen,
        name: 'input-body',
        input: true,
        keys: true,
        left: net.left,
        top: net.top,
        width: net.width,
        height: net.height,
        inputOnFocus: true,
        style: {
            bg: dat.clr1,
            focus: { bg: 'red' },
            hover: { bg: 'red' },
        },
    })

    input.focus()

    input.on('submit', (src: string) => {
        try {
            title.destroy()
            input.destroy()
            screen.render()
        } catch {
            // Teardown defensive catch
        }
        if (bal?.slv != null) bal.slv({ putBit: { idx: 'open-input', src } })
    })

    screen.render()
    return cpy
}
