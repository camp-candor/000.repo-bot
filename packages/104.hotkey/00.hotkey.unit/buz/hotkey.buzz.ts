import { HotkeyModel } from '../hotkey.model.js'
import HotkeyBit from '../fce/hotkey.bit.js'
import State from '../../99.core/state.js'

const hotkey = {
    list: async () => {
        return { models: [] as any[] }
    },
}

export const initHotkey = (cpy: HotkeyModel, bal: HotkeyBit, ste: State) => {
    const url =
        process.env.HOTKEY_URL ||
        'https://zero00-hotkey.onrender.com/api/hotkey/test'
    if (url) {
        fetch(url)
            .then((response) => response.json())
            .then((data) => {
                if (bal.slv != null) {
                    bal.slv({
                        intBit: {
                            idx: 'init-hotkey',
                            dat: {
                                hotkey: data,
                            },
                        },
                    })
                }
            })
            .catch((error: any) => {
                if (bal.slv != null) {
                    bal.slv({
                        intBit: { idx: 'init-hotkey-err', dat: error.message },
                    })
                }
            })
    } else {
        if (bal.slv != null) {
            bal.slv({ intBit: { idx: 'init-hotkey' } })
        }
    }
    return cpy
}

export const updateHotkey = (cpy: HotkeyModel, bal: HotkeyBit, ste: State) => {
    bal.slv({ intBit: { idx: 'update-hotkey' } })

    return cpy
}

export const testHotkey = (cpy: HotkeyModel, bal: HotkeyBit, ste: State) => {
    bal.slv({ mytBit: { idx: 'test-hotkey', val: 1 } })
    return cpy
}

export const listHotkey = async (
    cpy: HotkeyModel,
    bal: HotkeyBit,
    ste: State,
) => {
    const response = await hotkey.list()
    if (bal.slv != null)
        bal.slv({
            olmBit: {
                idx: 'list-hotkey',
                lst: response.models.map((m: any) => m.name),
            },
        })
    return cpy
}

export const executeHotkey = (cpy: HotkeyModel, bal: HotkeyBit, ste: State) => {
    debugger
    return cpy
}
