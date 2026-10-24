import * as ActCol from '../../97.collect.unit/collect.action'

import type { CollectModel } from '../collect.model'
import type CollectBit from '../fce/collect.bit'
import type State from '../../99.core/state'
import type CaboodleBit from '../fce/caboodle.bit'
import S from 'string'

import * as doT from 'dot'

let bit, lst, dat, idx, val, src, dex

export const initCollect = (cpy: CollectModel, bal: CollectBit, ste: State) => {
    return cpy
}

export const updateCollect = (
    cpy: CollectModel,
    bal: CollectBit,
    ste: State,
) => {
    return cpy
}

//return the first item in a collection
export const fetchCollect = (
    cpy: CollectModel,
    bal: CollectBit,
    ste: State,
) => {
    if (bal.val == null) bal.val = 1

    if (bal.bit == null)
        bal.slv({ colBit: { idx: 'fetch-collect-err', src: 'no-bit' } })
    const type = bal.bit.split(' ').slice(-1).pop().toLowerCase()
    const cabBit: CaboodleBit = cpy.caboodleBitList[cpy.caboodleBits[type]]

    if (bal.val == 1) bit = cabBit.bitList[0]
    else bit = cabBit

    if (bal.slv != null) bal.slv({ colBit: { idx: 'fetch-collect', dat: bit }, clcBit: { idx: 'fetch-collect', dat: bit } } as any)
    return cpy
}

export const readCollect = async (
    cpy: CollectModel,
    bal: CollectBit,
    ste: State,
) => {
    if (bal.bit == null)
        bal.slv({ colBit: { idx: 'read-collect-err', src: 'no-bit' } })

    const type = bal.bit.split(' ').slice(-1).pop().toLowerCase()
    if (cpy.caboodleBits[type] == null) createCollect(cpy, { idx: type }, ste)

    const cabBit: CaboodleBit = cpy.caboodleBitList[cpy.caboodleBits[type]]

    if (cabBit.bits[bal.idx] == null) {
        bit = await ste.hunt(ActCol.WRITE_COLLECT, {
            idx: bal.idx,
            src: bal.src,
            bit: bal.bit,
        })
    } else {
        dat = cabBit.bitList[cabBit.bits[bal.idx]]
    }

    if (bal.slv != null) bal.slv({ colBit: { idx: 'read-collect', dat }, clcBit: { idx: 'read-collect', dat } } as any)
    return cpy
}

export const writeCollect = async (
    cpy: CollectModel,
    bal: CollectBit,
    ste: State,
) => {
    dat = null

    //let us check see if it exists
    const type = bal.bit.split(' ').slice(-1).pop().toLowerCase()

    if (cpy.caboodleBits[type] == null) createCollect(cpy, { idx: type }, ste)

    if (bal.bit == null)
        bal.slv({ colBit: { idx: 'write-collect-err', src: 'no-bit' } })

    const cabBit: CaboodleBit = cpy.caboodleBitList[cpy.caboodleBits[type]]

    bal.idx

    val = 0

    if (cabBit.bits[bal.idx] == null) {
        bit = await ste.hunt(bal.bit, {
            idx: bal.idx,
            src: bal.src,
            dat: bal.dat,
        })
        const objDat = bit[Object.keys(bit)[0]]
        dat = objDat.dat

        if (dat == null) dat = {}

        dat.dex = cabBit.bitList.length
        cabBit.bitList.push(dat)

        let idx = bal.idx
        if (idx == null) idx = dat.idx

        if (idx == null) throw new Error('write collect has no idx')

        cabBit.bits[idx] = dat.dex
    } else {
        let cabDat = cabBit.bitList[cabBit.bits[bal.idx]]

        bal.dat

        val = 1

        for (const key in bal.dat) {
            if (cabDat == null) cabDat = {}
            cabDat[key] = bal.dat[key]
        }

        cabBit.bitList[cabBit.bits[bal.idx]] = cabDat
        dat = cabDat

        //!!! SUPER IMPORTANT
    }

    if (dat == null && bal.slv != null)
        bal.slv({ colBit: { idx: 'write-collect-err', src: 'no-dat' } })

    if (bal.slv != null) bal.slv({ colBit: { idx: 'write-collect', val, dat }, clcBit: { idx: 'write-collect', val, dat } } as any)

    return cpy
}

export const createCollect = (
    cpy: CollectModel,
    bal: CollectBit,
    ste: State,
) => {
    const cabBit: CaboodleBit = { idx: bal.idx, dex: 0, bits: {}, bitList: [] }
    cabBit.dex = cpy.caboodleBitList.length

    cpy.caboodleBitList.push(cabBit)
    cpy.caboodleBits[cabBit.idx] = cabBit.dex

    if (bal.slv != null)
        bal.slv({ colBit: { idx: 'create-collect', dat: cabBit } })

    return cpy
}

export const removeCollect = async (
    cpy: CollectModel,
    bal: CollectBit,
    ste: State,
) => {
    const type = bal.bit.split(' ').slice(-1).pop().toLowerCase()

    if (cpy.caboodleBits[type] == null)
        return bal.slv({ colBit: { idx: 'remove-collect-not-present' } })

    const cabBit: CaboodleBit = cpy.caboodleBitList[cpy.caboodleBits[type]]

    if (cabBit.bits[bal.idx] == null)
        return bal.slv({ colBit: { idx: 'remove-collect-idx-not-present' } })

    bit = await ste.hunt(bal.bit, { idx: bal.idx, src: bal.src, dat: bal.dat })
    const objDat = bit[Object.keys(bit)[0]]
    dat = objDat.dat

    dex = dat.dex

    for (let i = dex; i < cabBit.bitList.length - 1; i++) {
        const update = cabBit.bitList[i]
        update.dex -= 1
    }

    for (const key in dat) {
        dat[key] = null
    }

    delete cabBit.bits[bal.idx]
    const itm = cabBit.bitList.splice(dex, 1)

    cabBit.dex -= 1

    if (bal.slv != null)
        bal.slv({ colBit: { idx: 'remove-collect', dat: itm[0] } })

    return cpy
}

export const putCollect = (cpy: CollectModel, bal: CollectBit, ste: State) => {
    cpy.caboodleBits[bal.idx] = bal.val
    cpy.caboodleBitList[bal.val] = bal.dat

    if (bal.slv != null)
        bal.slv({ colBit: { idx: 'put-collect', dat: bal.dat } })
    return cpy
}

export const getCollect = (cpy: CollectModel, bal: CollectBit, ste: State) => {
    val = cpy.caboodleBits[bal.idx]
    dat = cpy.caboodleBitList[val]

    if (bal.slv != null) bal.slv({ colBit: { idx: 'get-collect', val, dat } })
    return cpy
}

export const modelCollect = (
    cpy: CollectModel,
    bal: CollectBit,
    ste: State,
) => {
    //

    if (bal.slv != null) bal.slv({ colBit: { idx: 'model-collect', dat: cpy } })
    return cpy
}

export const deleteCollect = (
    cpy: CollectModel,
    bal: CollectBit,
    ste: State,
) => {
    //
    return cpy
}

export const emptyCollect = (
    cpy: CollectModel,
    bal: CollectBit,
    ste: State,
) => {
    //
    return cpy
}

export const dotCollect = (cpy: CollectModel, bal: CollectBit, ste: State) => {
    const gel = bal.dat
    const out = []

    bal.src.split('\n').forEach((a, b) => {
        if (a.includes('//') == true) return
        const doTCompiled = doT.template(a)
        const outLine = doTCompiled(gel)
        out.push(outLine)
    })

    if (bal.slv != null)
        bal.slv({ colBit: { idx: 'dot-vurt', dat: out, src: out.join('\n') } })

    return cpy
}

export const formatCollect = (
    cpy: CollectModel,
    bal: CollectBit,
    ste: State,
) => {
    lst = bal.src.split(':')

    let idx = lst[0]

    const out = []

    idx = S(idx).collapseWhitespace().s
    const opt = lst[1].split(',')
    opt.forEach((a, b) => {
        const now = S(a).collapseWhitespace().s
        if (a.length < 1) return
        out.push(now)
    })

    dat = [idx, out]

    bal.slv({ colBit: { idx: 'format-collect', dat } })
    return cpy
}

export const listCollect = (cpy: CollectModel, bal: CollectBit, ste: State) => {
    if (bal.val == null) bal.val = 1
    const type = bal.bit.split(' ').slice(-1).pop().toLowerCase()
    if (cpy.caboodleBits[type] == null) createCollect(cpy, { idx: type }, ste)

    const cabBit: CaboodleBit = cpy.caboodleBitList[cpy.caboodleBits[type]]

    lst = []

    cabBit.bitList.forEach((a) => {
        if (bal.val == 0) {
            lst.push(a)
        } else if (bal.val == 1) {
            if (a.idx != null) lst.push(a.idx)
            if (a.id != null) lst.push(a.id)
        }
    })

    bal.slv({ colBit: { idx: 'list-collect', dat: lst } })

    return cpy
}

export const hashCollect = (cpy: CollectModel, bal: CollectBit, ste: State) => {
    if (bal.src == null) bal.src = ''
    lst = bal.src.split('\n')

    dat = {}

    lst.forEach((a) => {
        a = S(a).collapseWhitespace().s
        if (a.length < 3) return

        const hold = a.split(':')

        const dom = hold[0]
        const sub = hold[1]

        const now = sub.split(',')

        now.forEach((b, c) => {
            now[c] = S(b).collapseWhitespace().s
        })

        dat[dom] = now
    })

    bal.slv({ colBit: { idx: 'hash-collect', dat } })

    return cpy
}
