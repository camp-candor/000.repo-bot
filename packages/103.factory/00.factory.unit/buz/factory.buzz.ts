import { FactoryModel } from '../factory.model.js'
import FactoryBit from '../fce/factory.bit.js'
import State from '../../99.core/state.js'

const factory = {
    list: async () => {
        return { models: [] as any[] }
    },
}

export const initFactory = (cpy: FactoryModel, bal: FactoryBit, ste: State) => {
    const url =
        process.env.FACTORY_URL ||
        'https://zero00-factory.onrender.com/api/factory/test'
    if (url) {
        fetch(url)
            .then((response) => response.json())
            .then((data) => {
                if (bal.slv != null) {
                    bal.slv({
                        intBit: {
                            idx: 'init-factory',
                            dat: {
                                factory: data,
                            },
                        },
                    })
                }
            })
            .catch((error: any) => {
                if (bal.slv != null) {
                    bal.slv({
                        intBit: { idx: 'init-factory-err', dat: error.message },
                    })
                }
            })
    } else {
        if (bal.slv != null) {
            bal.slv({ intBit: { idx: 'init-factory' } })
        }
    }
    return cpy
}

export const updateFactory = (
    cpy: FactoryModel,
    bal: FactoryBit,
    ste: State,
) => {
    bal.slv({ intBit: { idx: 'update-factory' } })

    return cpy
}

export const testFactory = (cpy: FactoryModel, bal: FactoryBit, ste: State) => {
    bal.slv({ mytBit: { idx: 'test-factory', val: 1 } })
    return cpy
}

export const listFactory = async (
    cpy: FactoryModel,
    bal: FactoryBit,
    ste: State,
) => {
    const response = await factory.list()
    if (bal.slv != null)
        bal.slv({
            olmBit: {
                idx: 'list-factory',
                lst: response.models.map((m: any) => m.name),
            },
        })
    return cpy
}
