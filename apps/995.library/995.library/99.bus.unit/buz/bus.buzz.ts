import * as ActMnu from '../../98.menu.unit/menu.action'
import * as ActBus from '../../99.bus.unit/bus.action'
import * as ActCol from '../../97.collect.unit/collect.action'
import type { BusModel } from '../bus.model'
import type BusBit from '../fce/bus.bit'
import type State from '../../99.core/state'
import clone from 'clone-deep'

export const initBus = (cpy: BusModel, bal: BusBit, ste: State) => {
    cpy.actList = []

    let lst: any[] | null = null

    if (bal == null) bal = { idx: '' }
    if (bal.lst == null) bal.lst = []

    if (bal.src != null && Array.isArray(bal.src)) lst = bal.src

    bal.lst.forEach((a: any) => {
        for (const key in a) {
            cpy.actList.push(a[key])
        }
    })

    ste.bus = (idx: string, dat: any, bit: any) =>
        void updateBus(cpy, { idx, dat, bit }, ste)

    if (bal.dat != null) {
        cpy.MQTT = bal.dat
    } else {
        // console.log('return promise');
    }

    if (lst == null) {
        if (bal.src != null && typeof bal.src === 'string') cpy.host = bal.src
        if (cpy.MQTT) {
            cpy.client = cpy.MQTT.connect(cpy.host)
            cpy.client.on('message', (tpc: string, msg: any) => {
                void messageBus(cpy, { idx: tpc, src: msg }, ste)
            })
            cpy.client.on('connect', () => {
                // console.log(bal.idx + ' connected ' + cpy.host);
                void openBus(cpy, { idx: 'init-bus', lst: cpy.actList }, ste)
                if (bal.slv != null) bal.slv({ intBit: { idx: 'init-bus' } })
            })
        }
    } else {
        const complete = (list: any[]) => {
            list.shift()
            if (list.length != 0) return
            if (bal.slv != null) bal.slv({ intBit: { idx: 'init-bus' } })
        }

        lst.forEach((a: any) => {
            void ste
                .hunt(ActCol.WRITE_COLLECT, {
                    idx: a.idx,
                    src: a.src,
                    bit: ActBus.CREATE_BUS,
                })
                .then((bit: any) => {
                    const client = bit.clcBit.dat

                    client.on('message', (tpc: string, msg: any) => {
                        void messageBus(
                            cpy,
                            { idx: tpc, src: msg, bit: a.idx },
                            ste,
                        )
                    })
                    client.on('connect', () => {
                        // console.log(a.idx + ' connected ' + a.src);
                        void openBus(
                            cpy,
                            { idx: 'init-bus', lst: cpy.actList, bit: a.idx },
                            ste,
                        )
                        complete(lst)
                    })
                })
        })
    }

    return cpy
}

export const createBus = (cpy: BusModel, bal: BusBit, ste: State) => {
    const client = cpy.MQTT.connect(bal.src as string)
    if (bal.slv != null) bal.slv({ busBit: { idx: 'create-bus', dat: client } })
    return cpy
}

export const openBus = async (cpy: BusModel, bal: BusBit, ste: State) => {
    const out: string[] = []

    bal.lst?.forEach((a: any) => {
        if (a == null) return
        if (typeof a.includes !== 'function') return
        if (a.includes('[') && a.includes(']') == false) return
        out.push(a as string)
    })

    let client = cpy.client

    if (bal.bit != null) {
        const bit: any = await ste.hunt(ActCol.READ_COLLECT, {
            idx: bal.bit,
            bit: ActBus.CREATE_BUS,
        })
        if (bit?.clcBit) {
            client = bit.clcBit.dat
        }
    }

    out.forEach((a: string) => {
        client.subscribe(a, (err: Error | null) => {
            if (!err) {
                // console.log('subscribing ' + a);
            }
        })
    })

    return cpy
}

export const connectBus = (cpy: BusModel, bal: BusBit, ste: State) => {
    const lst: any[] = []
    if (bal.val == 1) patch(ste, ActMnu.INIT_MENU, { lst })
}

export const messageBus = async (cpy: BusModel, bal: BusBit, ste: State) => {
    let dat: any
    if (bal.src != null) {
        dat = typeof bal.src === 'string' ? bal.src : String(bal.src)
    }

    const idx = bal.idx
    if (dat != null) {
        try {
            dat = JSON.parse(dat as string)
        } catch (e) {
            // ignore
        }
    }

    let client = cpy.client

    if (bal.bit != null) {
        const bit: any = await ste.hunt(ActCol.READ_COLLECT, {
            idx: bal.bit,
            bit: ActBus.CREATE_BUS,
        })
        if (bit?.clcBit) {
            client = bit.clcBit.dat
        }
    }

    if (idx && idx.includes(cpy.responseSuffix)) {
        const responseIDX = bal.idx
        const obj = cpy.promises[responseIDX]

        if (obj?.slv != null) obj.slv(dat)

        client.unsubscribe(responseIDX, (err: Error | null) => {
            if (!err) {
                //console.log('hitting ' + responseIDX)
            }
        })
    } else if (idx) {
        const bit: any = await ste.hunt(idx, dat)
        const cloneBit = clone(bit)

        for (const key in cloneBit) {
            const itm = cloneBit[key]
            if (itm?.dat != null) {
                if (itm.dat.bit != null) itm.dat.bit = null
            }
        }

        client.publish(bal.idx + cpy.responseSuffix, JSON.stringify(cloneBit))
    }

    return cpy
}

export const updateBus = async (cpy: BusModel, bal: BusBit, ste: State) => {
    let client = cpy.client

    if (bal.bit != null) {
        const bit: any = await ste.hunt(ActCol.READ_COLLECT, {
            idx: bal.bit,
            bit: ActBus.CREATE_BUS,
        })
        if (bit?.clcBit) {
            client = bit.clcBit.dat
        }
    }

    if (client == null && bal.bit == null) {
        const bit: any = await ste.hunt(ActCol.FETCH_COLLECT, {
            bit: ActBus.CREATE_BUS,
        })
        if (bit?.clcBit) {
            client = bit.clcBit.dat
        }
    }

    const responseIDX = bal.idx + cpy.responseSuffix

    let slv: (val?: any) => void = () => {}
    const promo = new Promise((rslv) => (slv = rslv))

    const obj = { slv: (val0: any) => slv(val0) }

    cpy.promises[responseIDX] = obj

    if (client) {
        client.subscribe(responseIDX, (err: Error | null) => {
            if (!err) {
                //console.log('hitting ' + responseIDX)
            }
        })

        client.publish(bal.idx, JSON.stringify(bal.dat))
    }

    return promo
}

const patch = (ste: State, type: string, bale: any) =>
    ste.dispatch({ type, bale })
