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
            bal.slv({ putBit: { idx: 'open-input-headless', src: bal?.src || '', val: 0 } })
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

    let cleanedUp = false
    const cleanup = () => {
        if (cleanedUp) return
        cleanedUp = true

        try {
            input.unkey(['escape'], handleCancel)
            title.destroy()
            input.destroy()
            screen.render()
        } catch {
            // Teardown defensive catch
        }
    }

    const handleCancel = () => {
        cleanup()
        if (bal?.slv != null) {
            bal.slv({
                putBit: {
                    idx: 'open-input-cancel',
                    src: '',
                    val: -1,
                },
            })
        }
    }

    input.key(['escape'], handleCancel)

    input.on('submit', (src: string) => {
        const valStr = src || ''
        cleanup()
        if (bal?.slv != null) {
            bal.slv({
                putBit: {
                    idx: 'open-input',
                    src: valStr,
                    val: 0,
                },
            })
        }
    })

    input.focus()
    screen.render()

    return cpy
}
