import type { ChoiceModel } from '../choice.model'
import type ChoiceBit from '../fce/choice.bit'
import type State from '../../99.core/state'
import type NetBit from '../../81.grid.unit/fce/net.bit'
import * as Color from '../../val/console-color'

export const initChoice = (cpy: ChoiceModel, bal: ChoiceBit, _ste: State) => {
    if (bal?.slv != null) {
        bal.slv({ chcBit: { idx: 'init-choice' } })
    }
    return cpy
}

export const updateChoice = (cpy: ChoiceModel, bal: ChoiceBit, _ste: State) => {
    if (bal?.slv != null) {
        bal.slv({ chcBit: { idx: 'update-choice' } })
    }
    return cpy
}

export const openChoice = (cpy: ChoiceModel, bal: ChoiceBit, ste: State) => {
    const terminal = ste?.value?.terminal
    const blessed = terminal?.blessed
    const screen = terminal?.screen

    // Defensive headless fallback for automated runners and CI environments
    if (!screen || !blessed) {
        if (bal?.slv != null) {
            bal.slv({
                chcBit: {
                    idx: 'open-choice-headless',
                    src: bal?.lst && bal.lst.length > 0 ? bal.lst[0] : '',
                    val: 0,
                },
            })
        }
        return cpy
    }

    const dat: any = {
        idx: 'choice-bit',
        clr0: Color.BLACK,
        clr1: Color.YELLOW,
    }
    for (const key in bal?.dat) {
        dat[key] = bal.dat[key]
    }

    const net: NetBit = bal?.net || {
        left: 0,
        top: 0,
        width: '100%',
        height: '100%',
    }

    const form = blessed.form({
        parent: screen,
        keys: false,
        mouse: true,
        left: net.left,
        top: net.top,
        width: net.width,
        height: net.height,
        bg: dat.clr0,
        content: '',
    })

    const buttons: any[] = []
    const itemList: string[] = bal?.lst || []

    itemList.forEach((itemText: string, index: number) => {
        const isRedTheme = dat.clr1 === Color.RED || dat.clr1 === 'red'
        const focusBg = isRedTheme ? Color.YELLOW : 'red'
        const focusFg = isRedTheme ? 'black' : 'white'

        const btn = blessed.button({
            parent: form,
            mouse: true,
            keys: true,
            shrink: true,
            padding: {
                left: 2,
                right: 1,
            },
            left: 0,
            top: index,
            height: 1,
            width: '100%',
            name: itemText,
            content: itemText,
            style: {
                bg: dat.clr1,
                focus: {
                    bg: focusBg,
                    fg: focusFg,
                },
                hover: {
                    bg: focusBg,
                    fg: focusFg,
                },
            },
        })

        btn.on('press', () => {
            form.submit()
        })

        btn.on('focus', () => {
            form._selected = btn
            if (dat.cb) {
                dat.cb(itemText)
            }
        })

        buttons.push(btn)
    })

    // Vertical keyboard navigation mappings (Up/Down + Vim k/j)
    const handleUp = () => {
        form.focusPrevious()
        screen.render()
    }
    const handleDown = () => {
        form.focusNext()
        screen.render()
    }
    const handleSubmit = () => {
        form.submit()
    }
    const handleCancel = () => form.cancel()

    screen.key(['up', 'k'], handleUp)
    screen.key(['down', 'j'], handleDown)
    screen.key(['enter', 'return'], handleSubmit)
    screen.key(['escape'], handleCancel)

    let cleanedUp = false
    const cleanup = () => {
        if (cleanedUp) return
        cleanedUp = true

        // 1. Explicitly unbind all registered directional and cancel navigation keys
        screen.unkey(['up', 'k'], handleUp)
        screen.unkey(['down', 'j'], handleDown)
        screen.unkey(['enter', 'return'], handleSubmit)
        screen.unkey(['escape'], handleCancel)

        // 2. Detach and destroy widget subtree to liberate terminal memory
        form.destroy()

        // 3. Request coordinate repaint
        screen.render()
    }

    form.on('submit', () => {
        let selected = form._selected
        if (!selected && buttons.length > 0) {
            selected = buttons[0]
        }

        const src = selected ? selected.content : ''
        const val = selected ? selected.index - 1 : 0

        cleanup()

        if (bal?.slv != null) {
            bal.slv({ chcBit: { idx: 'open-choice', src, val } })
        }
    })

    form.on('cancel', () => {
        cleanup()

        if (bal?.slv != null) {
            bal.slv({ chcBit: { idx: 'open-choice-cancel', src: '', val: -1 } })
        }
    })

    if (buttons.length > 0 && typeof buttons[0].focus === 'function') {
        buttons[0].focus()
    }

    screen.render()
    return cpy
}

export const keyChoice = (cpy: ChoiceModel, bal: ChoiceBit, ste: State) => {
    const terminal = ste?.value?.terminal
    const blessed = terminal?.blessed
    const screen = terminal?.screen

    if (!screen || !blessed) {
        if (bal?.slv != null) {
            bal.slv({ chcBit: { idx: 'key-choice-headless' } })
        }
        return cpy
    }

    const net: NetBit = bal?.net || {
        left: 0,
        top: 0,
        width: '100%',
        height: '100%',
    }

    blessed.listbar({
        parent: screen,
        keys: true,
        left: net.left,
        top: net.top,
        width: net.width,
        height: net.height,
        style: { item: { fg: 'yellow' }, selected: { fg: 'yellow' } },
        commands: {
            Exit: {
                keys: ['C-c', 'escape'],
                callback: () => process.exit(0),
            },
        },
    })

    screen.render()
    if (bal?.slv != null) {
        bal.slv({ chcBit: { idx: 'key-choice' } })
    }
    return cpy
}

export const towerChoice = (cpy: ChoiceModel, bal: ChoiceBit, _ste: State) => {
    if (bal?.slv != null) {
        bal.slv({ chcBit: { idx: 'tower-choice' } })
    }
    return cpy
}
