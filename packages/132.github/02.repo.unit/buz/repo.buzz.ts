import { RepoModel } from '../repo.model.js'
import RepoBit from '../fce/repo.bit.js'
import State from '../../99.core/state.js'

const UPDATE_CONSOLE = '[Console action] Update Console'

const logConsole = async (src: string) => {
    if ((global as any).LIBRARY) {
        await (global as any).LIBRARY.hunt(UPDATE_CONSOLE, {
            idx: 'cns00',
            src,
        })
    }
}

const getBaseUrl = () => {
    return (
        (global as any).agentBaseUrl ||
        process.env.LOCAL_WORKER_URL ||
        process.env.WORKER_URL ||
        'http://127.0.0.1:8787'
    ).replace(/\/$/, '')
}

export const initRepo = (cpy: RepoModel, bal: RepoBit, ste: State) => {
    if (bal.slv) bal.slv({ repoBit: { idx: 'init-repo' } })
    return cpy
}

export const updateRepo = (cpy: RepoModel, bal: RepoBit, ste: State) => {
    if (bal.slv) bal.slv({ repoBit: { idx: 'update-repo' } })
    return cpy
}

export const writeRepo = async (cpy: RepoModel, bal: RepoBit, ste: State) => {
    if (!bal.src || !bal.src.trim()) {
        await logConsole('>> [WRITE_REPO ERROR]: No repository URL provided')
        if (bal.slv) bal.slv({ repoBit: { idx: 'write-repo-err', val: 0 } })
        return cpy
    }

    const targetUrl = `${getBaseUrl()}/api/repos/watch`
    await logConsole(
        `>> [REGISTER] Sending watch request for: ${bal.src.trim()}`,
    )

    try {
        const res = await fetch(targetUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: bal.src.trim() }),
        })
        const data: any = await res.json()

        if (res.ok) {
            await logConsole(
                `>> [OK] Repository watched: ${data.repo?.id || bal.src}`,
            )
            if (bal.slv)
                bal.slv({ repoBit: { idx: 'write-repo', val: 1, dat: data } })
        } else {
            await logConsole(
                `>> [FAIL] Registration rejected: ${data.error || res.statusText}`,
            )
            if (bal.slv)
                bal.slv({
                    repoBit: { idx: 'write-repo-err', val: 0, dat: data },
                })
        }
    } catch (err: any) {
        await logConsole(`>> [CONN_ERROR]: ${err.message}`)
        if (bal.slv) bal.slv({ repoBit: { idx: 'write-repo-err', val: 0 } })
    }
    return cpy
}

export const listRepo = async (cpy: RepoModel, bal: RepoBit, ste: State) => {
    const targetUrl = `${getBaseUrl()}/api/repos/watch`

    try {
        const res = await fetch(targetUrl)
        const data: any = await res.json()
        const repos = Array.isArray(data) ? data : []
        const lst = repos.map((r: any) => r.id || r.url)

        if (repos.length === 0) {
            await logConsole(
                '>> Watchlist is empty. No repositories currently tracked.',
            )
        } else {
            await logConsole(`>> Tracked Repositories (${repos.length}):`)
            repos.forEach((r: any) => logConsole(`>>   - ${r.id} (${r.url})`))
        }

        if (bal.slv) bal.slv({ repoBit: { idx: 'list-repo', lst, dat: repos } })
    } catch (err: any) {
        await logConsole(`>> [LIST_REPO ERROR]: ${err.message}`)
        if (bal.slv)
            bal.slv({ repoBit: { idx: 'list-repo-err', lst: [], val: 0 } })
    }
    return cpy
}

export const deleteRepo = async (cpy: RepoModel, bal: RepoBit, ste: State) => {
    if (!bal.src || !bal.src.trim()) {
        await logConsole(
            '>> [DELETE_REPO ERROR]: No repository specified for removal',
        )
        if (bal.slv) bal.slv({ repoBit: { idx: 'delete-repo-err', val: 0 } })
        return cpy
    }

    const targetUrl = `${getBaseUrl()}/api/repos/watch`
    await logConsole(`>> [UNWATCH] Removing repository: ${bal.src.trim()}`)

    try {
        const res = await fetch(targetUrl, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: bal.src.trim() }),
        })
        const data: any = await res.json()

        if (res.ok) {
            await logConsole(
                `>> [OK] Repository removed from watchlist: ${bal.src}`,
            )
            if (bal.slv)
                bal.slv({ repoBit: { idx: 'delete-repo', val: 1, dat: data } })
        } else {
            await logConsole(
                `>> [FAIL] Removal failed: ${data.error || res.statusText}`,
            )
            if (bal.slv)
                bal.slv({
                    repoBit: { idx: 'delete-repo-err', val: 0, dat: data },
                })
        }
    } catch (err: any) {
        await logConsole(`>> [CONN_ERROR]: ${err.message}`)
        if (bal.slv) bal.slv({ repoBit: { idx: 'delete-repo-err', val: 0 } })
    }
    return cpy
}

export const readRepo = async (cpy: RepoModel, bal: RepoBit, ste: State) => {
    if (!bal.src || !bal.src.trim()) {
        await logConsole('>> [READ_REPO ERROR]: No repository specified')
        if (bal.slv) bal.slv({ repoBit: { idx: 'read-repo-err', val: 0 } })
        return cpy
    }

    const targetUrl = `${getBaseUrl()}/api/repos/inspect`
    await logConsole('>> ==================================================')
    await logConsole(`>> [INSPECT REPO] Target: ${bal.src.trim()}`)
    await logConsole('>> ==================================================')

    try {
        const res = await fetch(targetUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: bal.src.trim() }),
        })

        if (!res.ok) {
            const errText = await res.text()
            await logConsole(`>> [HTTP ${res.status} FAIL]: ${errText}`)
            if (bal.slv) bal.slv({ repoBit: { idx: 'read-repo-err', val: 0 } })
            return cpy
        }

        const data: any = await res.json()
        const { commit, checks } = data

        await logConsole(
            `>> SHA:     ${commit.sha.slice(0, 7)} (${commit.author})`,
        )
        await logConsole(`>> Message: "${commit.message.split('\n')[0]}"`)
        await logConsole(
            `>> Status:  ${checks.status.toUpperCase()} (${checks.runs.length} check runs)`,
        )

        if (checks.all_passed) {
            await logConsole('>> RESULT:  [ALL CHECKS PASSING]')
        } else {
            await logConsole('>> RESULT:  [FAILURES DETECTED]')
            for (const run of checks.runs) {
                if (run.conclusion !== 'success') {
                    await logConsole(
                        `>>   [FAIL] ${run.name} -> ${run.conclusion || run.status}`,
                    )
                    if (run.details_url) {
                        await logConsole(
                            `>>          Details: ${run.details_url}`,
                        )
                    }
                }
            }
        }
        await logConsole(
            '>> ==================================================',
        )

        if (bal.slv) {
            bal.slv({
                repoBit: {
                    idx: 'read-repo',
                    val: checks.all_passed ? 1 : 0,
                    dat: data,
                },
            })
        }
    } catch (err: any) {
        await logConsole(`>> [READ_REPO ERROR]: ${err.message}`)
        if (bal.slv) bal.slv({ repoBit: { idx: 'read-repo-err', val: 0 } })
    }
    return cpy
}

export const healthRepo = async (cpy: RepoModel, bal: RepoBit, ste: State) => {
    const targetUrl = `${getBaseUrl()}/api/repos/health`

    await logConsole('>> ==================================================')
    await logConsole('>> [FLEET CI HEALTH] Scanning tracked repositories...')
    await logConsole('>> ==================================================')

    try {
        const res = await fetch(targetUrl, { method: 'POST' })
        const data: any = await res.json()

        if (!res.ok) {
            await logConsole(
                `>> [FAIL] Fleet check failed: ${data.error || res.statusText}`,
            )
            if (bal.slv)
                bal.slv({ repoBit: { idx: 'health-repo-err', val: 0 } })
            return cpy
        }

        if (data.totalRepos === 0) {
            await logConsole(
                '>> Watchlist is empty. Zero repositories to audit.',
            )
            await logConsole(
                '>> ==================================================',
            )
            if (bal.slv)
                bal.slv({ repoBit: { idx: 'health-repo', val: 1, dat: data } })
            return cpy
        }

        for (const item of data.results) {
            if (item.allPassed) {
                await logConsole(
                    `>> [PASS] ${item.id} :: SHA: ${item.sha.slice(0, 7)}`,
                )
            } else {
                await logConsole(
                    `>> [FAIL] ${item.id} :: SHA: ${item.sha.slice(0, 7)}`,
                )
                if (item.error) {
                    await logConsole(`>>        Reason: ${item.error}`)
                } else if (item.failedRuns && item.failedRuns.length > 0) {
                    for (const run of item.failedRuns) {
                        await logConsole(
                            `>>        Reason: Check "${run.name}" concluded with "${run.conclusion || run.status}"`,
                        )
                        if (run.details_url) {
                            await logConsole(
                                `>>        Details: ${run.details_url}`,
                            )
                        }
                    }
                }
            }
        }

        await logConsole(
            '>> --------------------------------------------------',
        )
        const verdict = data.allFleetPassed
            ? '[ALL PASSING]'
            : '[FAILURES PRESENT]'
        await logConsole(
            `>> SUMMARY: ${verdict} :: ${data.passedCount}/${data.totalRepos} Passing`,
        )
        await logConsole(
            '>> ==================================================',
        )

        if (bal.slv) {
            bal.slv({
                repoBit: {
                    idx: 'health-repo',
                    val: data.allFleetPassed ? 1 : 0,
                    dat: data,
                },
            })
        }
    } catch (err: any) {
        await logConsole(`>> [FLEET_HEALTH ERROR]: ${err.message}`)
        if (bal.slv) bal.slv({ repoBit: { idx: 'health-repo-err', val: 0 } })
    }
    return cpy
}
