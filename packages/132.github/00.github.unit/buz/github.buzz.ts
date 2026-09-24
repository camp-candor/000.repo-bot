import { GithubModel } from '../github.model.js'
import GithubBit from '../fce/github.bit.js'
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

const getBaseUrl = (): string => {
    return (
        (global as any).githubBaseUrl ||
        process.env.LIVE_WORKER_URL ||
        process.env.WORKER_URL ||
        'https://repo-bot-00.berad4000.workers.dev'
    ).replace(/\/$/, '')
}

export const initGithub = (cpy: GithubModel, bal: GithubBit, ste: State) => {
    if (bal.slv != null) bal.slv({ intBit: { idx: 'init-github' } })
    return cpy
}

export const updateGithub = (cpy: GithubModel, bal: GithubBit, ste: State) => {
    if (bal.slv != null) bal.slv({ intBit: { idx: 'update-github' } })
    return cpy
}

/**
 * Fetches in-flight candidate tasks from edge worker.
 */
export const fetchMergeCandidates = async (
    cpy: GithubModel,
    bal: GithubBit,
    ste: State,
) => {
    const baseUrl = getBaseUrl()
    const endpoint = `${baseUrl}/api/tasks/candidates`

    try {
        const res = await fetch(endpoint)
        const data: any = await res.json()
        const candidates = data.candidates || []

        if (bal.slv)
            bal.slv({
                gthBit: { idx: 'fetch-merge-candidates', lst: candidates },
            })
    } catch (err: any) {
        await logConsole(`>> [FLEET DISCOVERY ERROR]: ${err.message}`)
        if (bal.slv)
            bal.slv({ gthBit: { idx: 'fetch-merge-candidates-err', lst: [] } })
    }

    return cpy
}

/**
 * Inspects PR CAS status and compares auditedHeadSha vs remote head SHA.
 */
export const inspectPrCas = async (
    cpy: GithubModel,
    bal: GithubBit,
    ste: State,
) => {
    const baseUrl = getBaseUrl()
    const taskId = bal.src || bal.dat?.taskId || 'TEST-TASK-00'
    const endpoint = `${baseUrl}/api/tasks/${encodeURIComponent(taskId)}/inspect`

    await logConsole(
        '>> ==============================================================',
    )
    await logConsole(`>> [CAS PRE-FLIGHT AUDIT] Target Task: ${taskId}`)

    const t0 = Date.now()
    try {
        const res = await fetch(endpoint)
        const rtt = Date.now() - t0
        const data: any = await res.json()

        if (!res.ok || !data.ok) {
            await logConsole(
                `>> [HTTP ${res.status}] :: ${rtt}ms RTT :: TASK CONTEXT NOT FOUND`,
            )
            await logConsole(`>> Error: ${data.error || 'Unknown failure'}`)
            await logConsole(
                '>> ==============================================================',
            )
            if (bal.slv)
                bal.slv({
                    gthBit: { idx: 'inspect-pr-cas-err', val: 0, dat: data },
                })
            return cpy
        }

        const isLocked = !data.headDrift && Boolean(data.auditedHeadSha)
        const checksOk = data.checksPassed === true
        const shortAudited = (data.auditedHeadSha || 'none').slice(0, 7)
        const shortRemote = (data.remoteHeadSha || 'none').slice(0, 7)

        await logConsole(
            `>> [HTTP 200 OK] :: ${rtt}ms RTT :: PR #${data.pullNumber} (${data.state})`,
        )
        await logConsole(
            `>> Audited Head SHA : ${data.auditedHeadSha} (${shortAudited})`,
        )
        await logConsole(
            `>> Remote Head SHA  : ${data.remoteHeadSha} (${shortRemote})`,
        )
        await logConsole(
            `>> Head Drift Status: ${isLocked ? '[LOCKED & COMPATIBLE]' : '[FAIL: TOCTOU DIVERGENCE]'}`,
        )
        await logConsole(
            `>> Scope / QA Check : ${checksOk ? '[PASSED]' : '[FAIL: CHECKS PENDING / FAILED]'}`,
        )
        await logConsole(`>> Ephemeral Branch : ${data.branchName}`)
        await logConsole(
            '>> ==============================================================',
        )

        if (bal.slv) {
            bal.slv({
                gthBit: {
                    idx: 'inspect-pr-cas',
                    val: checksOk && isLocked ? 1 : 0,
                    dat: data,
                },
            })
        }
    } catch (err: any) {
        await logConsole(`>> [INSPECTION NETWORK ERROR]: ${err.message}`)
        if (bal.slv)
            bal.slv({
                gthBit: { idx: 'inspect-pr-cas-err', val: 0, src: err.message },
            })
    }

    return cpy
}

/**
 * Triggers the SHA-pinned merge executor via POST /fsm/transition.
 */
export const executeMerge = async (
    cpy: GithubModel,
    bal: GithubBit,
    ste: State,
) => {
    const baseUrl = getBaseUrl()
    const endpoint = `${baseUrl}/fsm/transition`
    const taskId = bal.src || bal.dat?.taskId
    const headSha = bal.dat?.headSha
    const pullNumber = bal.dat?.pullNumber || 0

    await logConsole(
        '>> ==============================================================',
    )
    await logConsole(
        `>> [EXECUTE CAS MERGE] Dispatching break-glass trigger for ${taskId}`,
    )

    const t0 = Date.now()
    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'HUMAN_APPROVED',
                taskId,
                headSha,
                actor: 'TERMINAL_OPERATOR',
            }),
        })

        const rtt = Date.now() - t0
        const data: any = await res.json()

        if (res.ok && data.action === 'STATE_TRANSITIONED') {
            const nextState = data.state
            const mergeSha =
                data.context?.mergeCommitSha || 'PENDING_OR_COMPLETED'

            await logConsole(
                `>> [HTTP 200 OK] :: ${rtt}ms RTT :: STATE: ${nextState}`,
            )
            await logConsole(`>> Pull Request     : #${pullNumber}`)
            await logConsole(`>> Audited Head SHA : ${headSha}`)
            await logConsole(`>> Merge Commit SHA : ${mergeSha}`)
            await logConsole(
                `>> Branch Status    : Ephemeral ref marked for deletion [OK]`,
            )
            await logConsole(
                `>> Slack Channel    : Announcement dispatched to #ops-bridge [OK]`,
            )
            await logConsole(
                '>> ==============================================================',
            )

            if (bal.slv)
                bal.slv({ gthBit: { idx: 'execute-merge', val: 1, dat: data } })
        } else {
            await logConsole(
                `>> [HTTP ${res.status}] :: ${rtt}ms RTT :: MERGE ABORTED`,
            )
            await logConsole(`>> Server Reason: ${JSON.stringify(data)}`)
            await logConsole(
                '>> ==============================================================',
            )
            if (bal.slv)
                bal.slv({
                    gthBit: { idx: 'execute-merge-err', val: 0, dat: data },
                })
        }
    } catch (err: any) {
        await logConsole(`>> [MERGE TRIGGER ERROR]: ${err.message}`)
        if (bal.slv)
            bal.slv({
                gthBit: { idx: 'execute-merge-err', val: 0, src: err.message },
            })
    }

    return cpy
}

export const listGithub = async (
    cpy: GithubModel,
    bal: GithubBit,
    ste: State,
) => {
    if (bal.slv != null) bal.slv({ gthBit: { idx: 'list-github' } })
    return cpy
}
