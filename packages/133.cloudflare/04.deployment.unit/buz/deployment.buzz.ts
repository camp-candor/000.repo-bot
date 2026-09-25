import { DeploymentModel } from '../deployment.model.js'
import DeploymentBit from '../fce/deployment.bit.js'
import * as ActDpl from '../deployment.action.js'
import State from '../../99.core/state.js'

import * as dotenv from 'dotenv'

dotenv.config()

export const initDeployment = (
    cpy: DeploymentModel,
    bal: DeploymentBit,
    ste: State,
) => {
    debugger
    return cpy
}

export const updateDeployment = (
    cpy: DeploymentModel,
    bal: DeploymentBit,
    ste: State,
) => {
    return cpy
}

export const listDeployment = async (
    cpy: DeploymentModel,
    bal: DeploymentBit,
    ste: State,
) => {
    const accountId = process.env.CLOUDFLARE_ACCOUNT
    const apiToken = process.env.CLOUDFLARE_WORKERS_TOKEN
    const projectId = bal.idx

    if (!accountId || !apiToken || !projectId) {
        debugger
        if (bal.slv != null)
            bal.slv({
                dplBit: {
                    idx: 'list-deployment',
                    dat: { deployments: [], err: 'Missing credentials' },
                },
            })
        return cpy
    }

    const fetchOptions = {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${apiToken}`,
            'Content-Type': 'application/json',
        },
    }

    try {
        let url = ''

        switch (bal.src) {
            case 'page': {
                url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${projectId}/deployments`
                break
            }
            case 'worker': {
                url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${projectId}/deployments`
                break
            }
            default:
                if (bal.slv != null)
                    bal.slv({
                        dplBit: {
                            idx: 'list-deployment',
                            dat: {
                                deployments: [],
                                err: 'Invalid source type',
                            },
                        },
                    })
                return cpy
        }

        const response = await fetch(url, fetchOptions)
        const data: any = await response.json()

        if (!response.ok || !data.success) {
            const errMsg =
                data.errors?.[0]?.message || 'Failed to fetch deployments'
            if (bal.slv != null)
                bal.slv({
                    dplBit: {
                        idx: 'list-deployment',
                        dat: { deployments: [], err: errMsg },
                    },
                })
            return cpy
        }

        let deployments: any[] = []

        if (bal.src === 'page') {
            deployments = Array.isArray(data.result) ? data.result : []
        } else if (bal.src === 'worker') {
            let items: any[] = []
            if (Array.isArray(data.result.deployments)) {
                items = data.result.deployments
            } else if (data.result && typeof data.result === 'object') {
                items = Array.isArray(data.result.items)
                    ? data.result.items
                    : []
            }
            deployments = items
        }

        var bit = await ste.hunt(ActDpl.CURRENT_DEPLOYMENT, {
            src: bal.src,
            idx: bal.idx,
        })
        const currentId = bit.dplBit?.dat?.idx

        if (currentId) {
            const match = deployments.find((d: any) => d.id === currentId)
            if (match) {
                match.id = 'LIVE: ' + match.id
            }
        }

        deployments

        if (bal.slv != null)
            bal.slv({
                dplBit: { idx: 'list-deployment', dat: { deployments } },
            })
    } catch (error) {
        if (bal.slv != null)
            bal.slv({
                dplBit: {
                    idx: 'list-deployment',
                    dat: { deployments: [], err: error },
                },
            })
    }

    return cpy
}

export const deleteDeployment = async (
    cpy: DeploymentModel,
    bal: DeploymentBit,
    ste: State,
) => {
    const accountId = process.env.CLOUDFLARE_ACCOUNT
    const apiToken = process.env.CLOUDFLARE_WORKERS_TOKEN
    const projectId = bal.idx
    const deploymentId = bal.dat?.id || ''

    if (!accountId || !apiToken || !projectId || !deploymentId) {
        if (bal.slv != null)
            bal.slv({
                dplBit: {
                    idx: 'delete-deployment',
                    dat: { err: 'Missing credentials or ID' },
                },
            })
        return cpy
    }

    if (deploymentId.includes('LIVE:')) {
        if (bal.slv != null)
            bal.slv({
                dplBit: {
                    idx: 'delete-deployment',
                    dat: { err: 'Cannot delete a LIVE deployment' },
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
        let url = ''
        switch (bal.src) {
            case 'page': {
                url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${projectId}/deployments/${deploymentId}?force=true`
                break
            }
            case 'worker': {
                url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${projectId}/deployments/${deploymentId}?force=true`
                break
            }
            default:
                if (bal.slv != null)
                    bal.slv({
                        dplBit: {
                            idx: 'delete-deployment',
                            dat: { err: 'Invalid source type' },
                        },
                    })
                return cpy
        }

        const response = await fetch(url, fetchOptions)
        const data: any = await response.json()

        if (!response.ok || !data.success) {
            const errMsg =
                data.errors?.[0]?.message || 'Failed to delete deployment'
            if (bal.slv != null)
                bal.slv({
                    dplBit: { idx: 'delete-deployment', dat: { err: errMsg } },
                })
            return cpy
        }

        const listBit = await ste.hunt(ActDpl.LIST_DEPLOYMENT, {
            src: bal.src,
            idx: bal.idx,
        })
        const remainingCount = listBit.dplBit?.dat?.deployments?.length || 0

        if (bal.slv != null)
            bal.slv({
                dplBit: {
                    idx: 'delete-deployment',
                    dat: { success: true, count: remainingCount },
                },
            })
    } catch (error) {
        if (bal.slv != null)
            bal.slv({
                dplBit: { idx: 'delete-deployment', dat: { err: error } },
            })
    }

    return cpy
}

export const testDeployment = (
    cpy: DeploymentModel,
    bal: DeploymentBit,
    ste: State,
) => {
    if (bal.slv != null) bal.slv({ dplBit: { idx: 'test-deployment', val: 1 } })
    return cpy
}

export const currentDeployment = async (
    cpy: DeploymentModel,
    bal: DeploymentBit,
    ste: State,
) => {
    const accountId = process.env.CLOUDFLARE_ACCOUNT
    const apiToken = process.env.CLOUDFLARE_WORKERS_TOKEN
    const projectId = bal.idx

    if (!accountId || !apiToken || !projectId) {
        debugger
        if (bal.slv != null)
            bal.slv({
                dplBit: {
                    idx: 'current-deployment',
                    dat: { err: 'Missing credentials' },
                },
            })
        return cpy
    }

    const fetchOptions = {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${apiToken}`,
            'Content-Type': 'application/json',
        },
    }

    try {
        let url = ''

        // 1. Determine the appropriate API URL based on source type
        switch (bal.src) {
            case 'page': {
                url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${projectId}/deployments`
                break
            }
            case 'worker': {
                url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${projectId}/deployments`
                break
            }
            default:
                if (bal.slv != null)
                    bal.slv({
                        dplBit: {
                            idx: 'current-deployment',
                            dat: { err: 'Invalid source type' },
                        },
                    })
                return cpy
        }

        // 2. Fetch data from Cloudflare
        const response = await fetch(url, fetchOptions)
        const data: any = await response.json()

        if (!response.ok || !data.success) {
            const errMsg =
                data.errors?.[0]?.message ||
                'Failed to fetch current deployment'
            if (bal.slv != null)
                bal.slv({
                    dplBit: { idx: 'current-deployment', dat: { err: errMsg } },
                })
            return cpy
        }

        // 3. Extract the most recent deployment using the streamlined switch logic
        let mostRecentDeployment = null

        switch (bal.src) {
            case 'page': {
                const deployments = Array.isArray(data.result)
                    ? data.result
                    : []
                if (deployments.length > 0) {
                    mostRecentDeployment = deployments[0]
                }

                break
            }

            case 'worker': {
                if (
                    Array.isArray(data.result.deployments) &&
                    data.result.deployments.length > 0
                ) {
                    mostRecentDeployment = data.result.deployments[0]
                } else {
                    const items = data.result?.items
                    const latest = data.result?.latest

                    debugger

                    if (Array.isArray(items) && items.length > 0) {
                        mostRecentDeployment = items[0]
                    } else if (latest) {
                        mostRecentDeployment = latest
                    }
                }
                break
            }
        }

        mostRecentDeployment

        // 4. If found, mark it live and resolve the deployment object
        if (mostRecentDeployment) {
            mostRecentDeployment.isLive = true
            if (bal.slv != null)
                bal.slv({
                    dplBit: {
                        idx: 'current-deployment',
                        dat: {
                            idx: mostRecentDeployment.id,
                            ...mostRecentDeployment,
                        },
                    },
                })
        } else {
            if (bal.slv != null)
                bal.slv({
                    dplBit: {
                        idx: 'current-deployment',
                        dat: { err: 'No recent deployment found' },
                    },
                })
        }
    } catch (error) {
        if (bal.slv != null)
            bal.slv({
                dplBit: { idx: 'current-deployment', dat: { err: error } },
            })
    }

    return cpy
}

const UPDATE_CONSOLE = '[Console action] Update Console'

export const wipeDeployment = async (
    cpy: DeploymentModel,
    bal: DeploymentBit,
    ste: State,
) => {
    const accountId = process.env.CLOUDFLARE_ACCOUNT
    const apiToken = process.env.CLOUDFLARE_WORKERS_TOKEN
    const projectId = bal.idx

    if (!accountId || !apiToken || !projectId) {
        if (bal.slv != null)
            bal.slv({
                dplBit: {
                    idx: 'wipe-deployment',
                    dat: { err: 'Missing credentials or project ID' },
                },
            })
        return cpy
    }

    try {
        let deletedCount = 0
        let errorCount = 0
        let hasMoreDeployments = true
        const failedDeploymentIds = new Set<string>()

        const fetchOptions = {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${apiToken}`,
                'Content-Type': 'application/json',
            },
        }

        while (hasMoreDeployments) {
            await (global as any).LIBRARY.hunt(UPDATE_CONSOLE, {
                idx: 'cns00',
                src: `Fetching deployments for project: ${projectId}...`,
            })

            const listBit = await ste.hunt(ActDpl.LIST_DEPLOYMENT, {
                src: bal.src,
                idx: bal.idx,
            })
            const deployments = listBit.dplBit?.dat?.deployments || []

            const candidates = deployments.filter((dpl: any) => {
                const deploymentId = dpl.id || dpl
                if (
                    typeof deploymentId === 'string' &&
                    deploymentId.includes('LIVE:')
                )
                    return false
                if (failedDeploymentIds.has(deploymentId)) return false
                return true
            })

            if (candidates.length === 0) {
                hasMoreDeployments = false
                break
            }

            await (global as any).LIBRARY.hunt(UPDATE_CONSOLE, {
                idx: 'cns00',
                src: `Wiping batch of ${candidates.length} deployments...`,
            })

            for (const dpl of candidates) {
                const deploymentId = dpl.id || dpl

                await (global as any).LIBRARY.hunt(UPDATE_CONSOLE, {
                    idx: 'cns00',
                    src: `Deleting deployment: ${deploymentId}...`,
                })

                let url = ''
                switch (bal.src) {
                    case 'page': {
                        url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${projectId}/deployments/${deploymentId}?force=true`
                        break
                    }
                    case 'worker': {
                        url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${projectId}/deployments/${deploymentId}?force=true`
                        break
                    }
                    default:
                        await (global as any).LIBRARY.hunt(UPDATE_CONSOLE, {
                            idx: 'cns00',
                            src: `Invalid source type: ${bal.src}`,
                        })
                        failedDeploymentIds.add(deploymentId)
                        continue
                }

                try {
                    const response = await fetch(url, fetchOptions)
                    const data: any = await response.json()

                    if (!response.ok || !data.success) {
                        const errMsg =
                            data.errors?.[0]?.message || 'Failed to delete'
                        await (global as any).LIBRARY.hunt(UPDATE_CONSOLE, {
                            idx: 'cns00',
                            src: `Error deleting ${deploymentId}: ${errMsg}`,
                        })
                        failedDeploymentIds.add(deploymentId)
                        errorCount++
                    } else {
                        await (global as any).LIBRARY.hunt(UPDATE_CONSOLE, {
                            idx: 'cns00',
                            src: `Successfully deleted: ${deploymentId}`,
                        })
                        deletedCount++
                    }
                } catch (err: any) {
                    await (global as any).LIBRARY.hunt(UPDATE_CONSOLE, {
                        idx: 'cns00',
                        src: `Error deleting ${deploymentId}: ${err.message || err}`,
                    })
                    failedDeploymentIds.add(deploymentId)
                    errorCount++
                }

                await new Promise((resolve) => setTimeout(resolve, 100))
            }
        }

        const finalBit = await ste.hunt(ActDpl.LIST_DEPLOYMENT, {
            src: bal.src,
            idx: bal.idx,
        })
        const remainingCount = finalBit.dplBit?.dat?.deployments?.length || 0

        await (global as any).LIBRARY.hunt(UPDATE_CONSOLE, {
            idx: 'cns00',
            src: `Wipe complete. Deleted: ${deletedCount}, Errors: ${errorCount}, Remaining: ${remainingCount}`,
        })

        if (bal.slv != null)
            bal.slv({
                dplBit: {
                    idx: 'wipe-deployment',
                    dat: {
                        success: true,
                        deletedCount,
                        errorCount,
                        count: remainingCount,
                    },
                },
            })
    } catch (error: any) {
        await (global as any).LIBRARY.hunt(UPDATE_CONSOLE, {
            idx: 'cns00',
            src: `Fatal error during wipe: ${error.message || error}`,
        })
        if (bal.slv != null)
            bal.slv({ dplBit: { idx: 'wipe-deployment', dat: { err: error } } })
    }

    return cpy
}
