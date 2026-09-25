import { CloudflareModel } from '../cloudflare.model.js'
import CloudflareBit from '../fce/cloudflare.bit.js'

import State from '../../99.core/state.js'
import * as dotenv from 'dotenv'

import * as ActCfl from '../cloudflare.action.js'
import * as ActWrk from '../../02.workers.unit/workers.action.js'
import * as ActPag from '../../03.pages.unit/pages.action.js'

dotenv.config()

var bit, dat

export const initCloudflare = async (
    cpy: CloudflareModel,
    bal: CloudflareBit,
    ste: State,
) => {
    bit = await ste.hunt(ActCfl.PROJECT_CLOUDFLARE)

    dat = bit.cflBit.dat

    const { workers } = dat
    const { pages } = dat

    // Fire off all worker tasks simultaneously
    await Promise.all(
        workers.map(async (worker) => {
            bit = await ste.hunt(ActWrk.WRITE_WORKERS, {
                idx: worker.id,
                src: 'workers',
                dat: worker,
            })
        }),
    )

    await Promise.all(
        pages.map(async (pages) => {
            bit = await ste.hunt(ActPag.WRITE_PAGES, {
                idx: pages.name || pages.id,
                src: 'pages',
                dat: pages,
            })
        }),
    )

    bal.slv({ intBit: { idx: 'init-cloudflare' } })
    return cpy
}

export const updateCloudflare = (
    cpy: CloudflareModel,
    bal: CloudflareBit,
    ste: State,
) => {
    bal.slv({ intBit: { idx: 'update-cloudflare' } })

    return cpy
}

export const testCloudflare = (
    cpy: CloudflareModel,
    bal: CloudflareBit,
    ste: State,
) => {
    bal.slv({ mytBit: { idx: 'test-cloudflare', val: 1 } })
    return cpy
}

export const listCloudflare = async (
    cpy: CloudflareModel,
    bal: CloudflareBit,
    ste: State,
) => {
    const lst = ['cloudflare-page-1', 'cloudflare-worker-1']
    if (bal.slv != null) bal.slv({ cflBit: { idx: 'list-cloudflare', lst } })
    return cpy
}

export const projectCloudflare = async (
    cpy: CloudflareModel,
    bal: CloudflareBit,
    ste: State,
) => {
    const accountId = process.env.CLOUDFLARE_ACCOUNT
    const apiToken = process.env.CLOUDFLARE_WORKERS_TOKEN

    if (!accountId || !apiToken) {
        if (bal.slv != null)
            bal.slv({
                cflBit: {
                    idx: 'project-cloudflare',
                    lst: { workers: [], pages: [] },
                    err: 'Missing credentials',
                },
            })
        return cpy
    }

    try {
        const workersResponse = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts`,
            {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${apiToken}`,
                    'Content-Type': 'application/json',
                },
            },
        )

        const pagesResponse = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects`,
            {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${apiToken}`,
                    'Content-Type': 'application/json',
                },
            },
        )

        const workersData: any = await workersResponse.json()
        const pagesData: any = await pagesResponse.json()

        const dat = {
            workers: workersData.result || [],
            pages: pagesData.result || [],
        }

        if (bal.slv != null)
            bal.slv({ cflBit: { idx: 'project-cloudflare', dat } })
    } catch (error) {
        if (bal.slv != null)
            bal.slv({
                cflBit: {
                    idx: 'project-cloudflare',
                    dat: { workers: [], pages: [] },
                    err: error,
                },
            })
    }

    return cpy
}
