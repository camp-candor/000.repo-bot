import { WorkersModel } from '../workers.model.js'
import WorkersBit from '../fce/workers.bit.js'
import WrkBit from '../fce/wrkBit.js'

import State from '../../99.core/state.js'

import * as ActCol from '../../97.collect.unit/collect.action.js'
import * as ActWrk from '../../02.workers.unit/workers.action.js'

var bit, dat

export const initWorkers = (cpy: WorkersModel, bal: WorkersBit, ste: State) => {
    return cpy
}

export const updateWorkers = (
    cpy: WorkersModel,
    bal: WorkersBit,
    ste: State,
) => {
    if (bal.slv) bal.slv({ wrkBit: { idx: 'update-workers' } })
    return cpy
}

export const readWorkers = async (
    cpy: WorkersModel,
    bal: WorkersBit,
    ste: State,
) => {
    if (bal.idx == null) bal.idx = 'wrk00'

    bit = await ste.hunt(ActCol.READ_COLLECT, {
        idx: bal.idx,
        bit: ActWrk.CREATE_WORKERS,
    })

    if (bal.slv)
        bal.slv({ wrkBit: { idx: 'read-workers', dat: bit.clcBit.dat } })
    return cpy
}

export const writeWorkers = async (
    cpy: WorkersModel,
    bal: WorkersBit,
    ste: State,
) => {
    if (bal.dat == null) bal.dat = {}

    bit = await ste.hunt(ActCol.WRITE_COLLECT, {
        idx: bal.idx,
        dat: bal.dat,
        bit: ActWrk.CREATE_WORKERS,
    })
    dat = bit.clcBit.dat
    if (bal.slv) bal.slv({ wrkBit: { idx: 'write-workers', dat } })
    return cpy
}

export const removeWorkers = async (
    cpy: WorkersModel,
    bal: WorkersBit,
    ste: State,
) => {
    bit = await ste.hunt(ActCol.REMOVE_COLLECT, {
        idx: bal.idx,
        bit: ActWrk.DELETE_WORKERS,
    })

    if (bal.slv)
        bal.slv({ wrkBit: { idx: 'remove-workers', dat: bit.clcBit.dat } })
    return cpy
}

export const deleteWorkers = async (
    cpy: WorkersModel,
    bal: WorkersBit,
    ste: State,
) => {
    const accountId = process.env.CLOUDFLARE_ACCOUNT
    const apiToken = process.env.CLOUDFLARE_WORKERS_TOKEN

    if (!accountId || !apiToken) {
        if (bal.slv != null)
            bal.slv({
                wrkBit: { idx: 'delete-workers', err: 'Missing credentials' },
            })
        return cpy
    }

    if (bal.idx == null) {
        if (bal.slv != null)
            bal.slv({
                wrkBit: { idx: 'delete-workers', err: 'Missing worker idx' },
            })
        return cpy
    }

    let cleanIdx = bal.idx
    if (typeof cleanIdx === 'string' && cleanIdx.startsWith('LIVE: ')) {
        cleanIdx = cleanIdx.replace(/^LIVE:\s*/, '')
    }

    try {
        const response = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${cleanIdx}`,
            {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${apiToken}`,
                    'Content-Type': 'application/json',
                },
            },
        )

        const data: any = await response.json()

        if (data.success) {
            await ste.hunt(ActCol.REMOVE_COLLECT, {
                idx: cleanIdx,
                bit: ActWrk.CREATE_WORKERS,
            })
            if (bal.slv != null)
                bal.slv({ wrkBit: { idx: 'delete-workers', dat: data } })
        } else {
            if (bal.slv != null)
                bal.slv({ wrkBit: { idx: 'delete-workers', err: data.errors } })
        }
    } catch (error) {
        if (bal.slv != null)
            bal.slv({ wrkBit: { idx: 'delete-workers', err: error } })
    }

    return cpy
}

export const createWorkers = (
    cpy: WorkersModel,
    bal: WorkersBit,
    ste: State,
) => {
    if (bal.dat == null) bal.dat = {}
    var wrkBit: WrkBit = { idx: bal.idx, src: bal.dat.src }

    if (bal.slv) bal.slv({ wrkBit: { idx: 'create-workers', dat: wrkBit } })
    return cpy
}

export const selectWorkers = (
    cpy: WorkersModel,
    bal: WorkersBit,
    ste: State,
) => {
    let cleanIdx = bal.idx

    // If the index is a string and starts with "LIVE: ", strip it out
    if (typeof cleanIdx === 'string' && cleanIdx.startsWith('LIVE: ')) {
        cleanIdx = cleanIdx.replace(/^LIVE:\s*/, '')
    }

    cpy.idx = cleanIdx

    if (bal.slv) bal.slv({ wrkBit: { idx: cleanIdx } })
    return cpy
}

export const listWorkers = async (
    cpy: WorkersModel,
    bal: WorkersBit,
    ste: State,
) => {
    if (bal.val == null) bal.val = 1
    bit = await ste.hunt(ActCol.LIST_COLLECT, {
        val: bal.val,
        bit: ActWrk.CREATE_WORKERS,
    })
    if (bal.slv)
        bal.slv({ wrkBit: { idx: 'list-workers', lst: bit.clcBit.lst } })
    return cpy
}
