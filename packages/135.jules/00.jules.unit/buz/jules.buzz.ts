import { JulesModel } from '../jules.model.js'
import JulesBit from '../fce/jules.bit.js'
import State from '../../99.core/state.js'

const jules = {
    list: async () => {
        return { models: [] as any[] }
    },
}

export const initJules = (cpy: JulesModel, bal: JulesBit, ste: State) => {
    const url =
        process.env.JULES_URL ||
        'https://zero00-jules.onrender.com/api/jules/test'
    if (url) {
        fetch(url)
            .then((response) => response.json())
            .then((data) => {
                if (bal.slv != null) {
                    bal.slv({
                        intBit: {
                            idx: 'init-jules',
                            dat: {
                                jules: data,
                            },
                        },
                    })
                }
            })
            .catch((error: any) => {
                if (bal.slv != null) {
                    bal.slv({
                        intBit: { idx: 'init-jules-err', dat: error.message },
                    })
                }
            })
    } else {
        if (bal.slv != null) {
            bal.slv({ intBit: { idx: 'init-jules' } })
        }
    }
    return cpy
}

export const updateJules = (cpy: JulesModel, bal: JulesBit, ste: State) => {
    bal.slv({ intBit: { idx: 'update-jules' } })

    return cpy
}

export const testJules = (cpy: JulesModel, bal: JulesBit, ste: State) => {
    bal.slv({ mytBit: { idx: 'test-jules', val: 1 } })
    return cpy
}

export const listJules = async (cpy: JulesModel, bal: JulesBit, ste: State) => {
    const response = await jules.list()
    if (bal.slv != null)
        bal.slv({
            olmBit: {
                idx: 'list-jules',
                lst: response.models.map((m: any) => m.name),
            },
        })
    return cpy
}
