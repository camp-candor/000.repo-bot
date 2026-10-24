import { PivotModel } from '../pivot.model.js'
import PivotBit from '../fce/pivot.bit.js'
import State from '../../99.core/state.js'

const pivot = {
    list: async () => {
        return { models: [] as any[] }
    },
}

export const initPivot = (cpy: PivotModel, bal: PivotBit, ste: State) => {
    const url =
        process.env.PIVOT_URL ||
        'https://zero00-pivot.onrender.com/api/pivot/test'
    if (url) {
        fetch(url)
            .then((response) => response.json())
            .then((data) => {
                if (bal.slv != null) {
                    bal.slv({
                        intBit: {
                            idx: 'init-pivot',
                            dat: {
                                pivot: data,
                            },
                        },
                    })
                }
            })
            .catch((error: any) => {
                if (bal.slv != null) {
                    bal.slv({
                        intBit: { idx: 'init-pivot-err', dat: error.message },
                    })
                }
            })
    } else {
        if (bal.slv != null) {
            bal.slv({ intBit: { idx: 'init-pivot' } })
        }
    }
    return cpy
}

export const updatePivot = (cpy: PivotModel, bal: PivotBit, ste: State) => {
    bal.slv({ intBit: { idx: 'update-pivot' } })

    return cpy
}

export const testPivot = (cpy: PivotModel, bal: PivotBit, ste: State) => {
    bal.slv({ mytBit: { idx: 'test-pivot', val: 1 } })
    return cpy
}

export const listPivot = async (cpy: PivotModel, bal: PivotBit, ste: State) => {
    const response = await pivot.list()
    if (bal.slv != null)
        bal.slv({
            olmBit: {
                idx: 'list-pivot',
                lst: response.models.map((m: any) => m.name),
            },
        })
    return cpy
}
