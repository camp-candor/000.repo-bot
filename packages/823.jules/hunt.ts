import * as Import from './BEE.js'
import State from './99.core/state.js'

let instance: any = null

const sim: any = {
    hunt: null,
    state: null,
}

sim.hunt = (typ: string, obj: any) => {
    return host(obj, typ)
}

const host = (obj: any, typ: string) => {
    init()

    let slv: any
    const promo = new Promise((rslv) => (slv = rslv))

    if (obj == null) obj = {}
    if (obj.slv == null) obj.slv = (val0: any) => slv(val0)

    sim.state.dispatch({ type: typ, bale: obj })
    return promo
}

const init = () => {
    if (!instance) {
        if (sim.state != null) return
        sim.state = new State()
        sim.state.pivot = sim
        sim.state.hunt = sim.hunt
        for (const k in Import.list) {
            new Import.list[k](sim.state)
        }
        instance = sim
    }
    return instance
}

export const jules = async (typ: string, obj: any) => {
    return sim.hunt(typ, obj)
}

export default sim
