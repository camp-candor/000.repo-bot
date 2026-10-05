import { GeminiModel } from '../gemini.model.js'
import GeminiBit from '../fce/gemini.bit.js'
import State from '../../99.core/state.js'

const gemini = {
    list: async () => {
        return { models: [] as any[] }
    },
}

export const initGemini = (cpy: GeminiModel, bal: GeminiBit, ste: State) => {
    const url =
        process.env.GEMINI_URL ||
        'https://zero00-gemini.onrender.com/api/gemini/test'
    if (url) {
        fetch(url)
            .then((response) => response.json())
            .then((data) => {
                if (bal.slv != null) {
                    bal.slv({
                        intBit: {
                            idx: 'init-gemini',
                            dat: {
                                gemini: data,
                            },
                        },
                    })
                }
            })
            .catch((error: any) => {
                if (bal.slv != null) {
                    bal.slv({
                        intBit: { idx: 'init-gemini-err', dat: error.message },
                    })
                }
            })
    } else {
        if (bal.slv != null) {
            bal.slv({ intBit: { idx: 'init-gemini' } })
        }
    }
    return cpy
}

export const updateGemini = (cpy: GeminiModel, bal: GeminiBit, ste: State) => {
    bal.slv({ intBit: { idx: 'update-gemini' } })

    return cpy
}

export const testGemini = (cpy: GeminiModel, bal: GeminiBit, ste: State) => {
    bal.slv({ mytBit: { idx: 'test-gemini', val: 1 } })
    return cpy
}

export const listGemini = async (
    cpy: GeminiModel,
    bal: GeminiBit,
    ste: State,
) => {
    const response = await gemini.list()
    if (bal.slv != null)
        bal.slv({
            olmBit: {
                idx: 'list-gemini',
                lst: response.models.map((m: any) => m.name),
            },
        })
    return cpy
}

export const openGemini = (cpy: GeminiModel, bal: GeminiBit, ste: State) => {
    debugger
    return cpy
}
