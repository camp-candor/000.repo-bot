import { PagesModel } from '../pages.model.js'
import PagesBit from '../fce/pages.bit.js'
import PgsBit from '../fce/pgsBit.js'

import State from '../../99.core/state.js'

import * as ActCol from '../../97.collect.unit/collect.action.js'
import * as Act from '../pages.action.js'

var bit, dat

export const initPages = (cpy: PagesModel, bal: PagesBit, ste: State) => {
    return cpy
}

export const updatePages = (cpy: PagesModel, bal: PagesBit, ste: State) => {
    if (bal.slv) bal.slv({ pgsBit: { idx: 'update-pages' } })
    return cpy
}

export const readPages = async (cpy: PagesModel, bal: PagesBit, ste: State) => {
    if (bal.idx == null) bal.idx = 'pgs00'

    bit = await ste.hunt(ActCol.READ_COLLECT, {
        idx: bal.idx,
        bit: Act.CREATE_PAGES,
    })

    if (bal.slv) bal.slv({ pgsBit: { idx: 'read-pages', dat: bit.clcBit.dat } })
    return cpy
}

export const writePages = async (
    cpy: PagesModel,
    bal: PagesBit,
    ste: State,
) => {
    if (bal.dat == null) bal.dat = {}

    bit = await ste.hunt(ActCol.WRITE_COLLECT, {
        idx: bal.idx,
        dat: bal.dat,
        bit: Act.CREATE_PAGES,
    })
    dat = bit.clcBit.dat
    if (bal.slv) bal.slv({ pgsBit: { idx: 'write-pages', dat } })
    return cpy
}

export const removePages = async (
    cpy: PagesModel,
    bal: PagesBit,
    ste: State,
) => {
    bit = await ste.hunt(ActCol.REMOVE_COLLECT, {
        idx: bal.idx,
        bit: Act.DELETE_PAGES,
    })

    if (bal.slv)
        bal.slv({ pgsBit: { idx: 'remove-pages', dat: bit.clcBit.dat } })
    return cpy
}

export const deletePages = async (
    cpy: PagesModel,
    bal: PagesBit,
    ste: State,
) => {
    const accountId = process.env.CLOUDFLARE_ACCOUNT
    const apiToken = process.env.CLOUDFLARE_WORKERS_TOKEN
    const projectId = bal.idx

    if (!accountId || !apiToken || !projectId) {
        if (bal.slv != null)
            bal.slv({
                pgsBit: {
                    idx: 'delete-pages',
                    dat: { err: 'Missing credentials or ID' },
                },
            })
        return cpy
    }

    const fetchOptions = {
        method: 'DELETE',
        headers: {
            'Authorization': `Bearer ${apiToken}`,
            'Content-Type': 'application/json',
        },
    }

    try {
        const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${projectId}`
        const response = await fetch(url, fetchOptions)
        const data: any = await response.json()

        if (!response.ok || !data.success) {
            const errMsg = data.errors?.[0]?.message || 'Failed to delete page'
            if (bal.slv != null)
                bal.slv({
                    pgsBit: { idx: 'delete-pages', dat: { err: errMsg } },
                })
            return cpy
        }

        await ste.hunt(ActCol.REMOVE_COLLECT, {
            idx: projectId,
            bit: Act.CREATE_PAGES,
        })
        if (bal.slv != null)
            bal.slv({ pgsBit: { idx: 'delete-pages', dat: { success: true } } })
    } catch (error) {
        if (bal.slv != null)
            bal.slv({ pgsBit: { idx: 'delete-pages', dat: { err: error } } })
    }

    return cpy
}

export const createPages = (cpy: PagesModel, bal: PagesBit, ste: State) => {
    if (bal.dat == null) bal.dat = {}
    var pgsBit: PgsBit = { idx: bal.idx, src: bal.dat.src }

    if (bal.slv) bal.slv({ pgsBit: { idx: 'create-pages', dat: pgsBit } })
    return cpy
}

export const listPages = async (cpy: PagesModel, bal: PagesBit, ste: State) => {
    bit = await ste.hunt(ActCol.LIST_COLLECT, { val: 1, bit: Act.CREATE_PAGES })
    if (bal.slv) bal.slv({ pgsBit: { idx: 'list-pages', lst: bit.clcBit.lst } })

    return cpy
}

export const selectPages = (cpy: PagesModel, bal: PagesBit, ste: State) => {
    let cleanIdx = bal.idx

    // If the index is a string and starts with "LIVE: ", strip it out
    if (typeof cleanIdx === 'string' && cleanIdx.startsWith('LIVE: ')) {
        cleanIdx = cleanIdx.replace(/^LIVE:\s*/, '')
    }

    cpy.idx = cleanIdx

    if (bal.slv) bal.slv({ pgsBit: { idx: cleanIdx } })
    return cpy
}
