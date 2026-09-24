import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { GithubModel } from '../github.model.js'
import GithubBit from '../fce/github.bit.js'
import State from '../../99.core/state.js'

const execAsync = promisify(exec)
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

        await logConsole(
            `>> [HTTP 200 OK] :: ${rtt}ms RTT :: PR #${data.pullNumber} (${data.state})`,
        )
        await logConsole(`>> Audited Head SHA : ${data.auditedHeadSha}`)
        await logConsole(`>> Remote Head SHA  : ${data.remoteHeadSha}`)
        await logConsole(
            `>> Head Drift Status: ${isLocked ? '[LOCKED & COMPATIBLE]' : '[FAIL: TOCTOU DIVERGENCE]'}`,
        )
        await logConsole(
            `>> Scope / QA Check : ${checksOk ? '[PASSED]' : '[FAIL: CHECKS PENDING / FAILED]'}`,
        )
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
            await logConsole(
                `>> [HTTP 200 OK] :: ${rtt}ms RTT :: STATE: ${data.state}`,
            )
            await logConsole(`>> Pull Request     : #${pullNumber}`)
            await logConsole(
                `>> Merge Commit SHA : ${data.context?.mergeCommitSha || 'PROCESSED'}`,
            )
            await logConsole(
                `>> Status           : Ephemeral ref obliterated [OK]`,
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

/**
 * Triggers compensating saga rollback for a task via POST /fsm/transition.
 */
export const triggerTaskRollback = async (
    cpy: GithubModel,
    bal: GithubBit,
    ste: State,
) => {
    const baseUrl = getBaseUrl()
    const endpoint = `${baseUrl}/fsm/transition`
    const taskId = bal.src || bal.dat?.taskId
    const reason = bal.dat?.reason || 'TERMINAL_OPERATOR_ABORT'
    const isPostMerge = Boolean(bal.dat?.isPostMerge)

    await logConsole(
        '>> ==============================================================',
    )
    await logConsole(
        `>> [COMPENSATING SAGA TRIGGER] Initiating rollback for ${taskId}`,
    )
    await logConsole(
        `>> Mode: ${isPostMerge ? 'TIER-2 (POST-MERGE)' : 'TIER-1 (PRE-MERGE)'} | Reason: ${reason}`,
    )

    const t0 = Date.now()
    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: isPostMerge ? 'POST_MERGE_REGRESSION' : 'HUMAN_REJECTED',
                taskId,
                reason,
                actor: 'TERMINAL_OPERATOR',
            }),
        })

        const rtt = Date.now() - t0
        const data: any = await res.json()

        if (res.ok && data.action === 'STATE_TRANSITIONED') {
            await logConsole(
                `>> [HTTP 200 OK] :: ${rtt}ms RTT :: STATE: ${data.state}`,
            )
            await logConsole(`>> Task ID          : ${taskId}`)
            await logConsole(`>> Compensating Saga: Dispatched via outbox [OK]`)
            await logConsole(`>> Watchdog Alarms  : Disarmed [OK]`)
            await logConsole(`>> Slack Alert      : Sent to #ops-bridge [OK]`)
            await logConsole(
                '>> ==============================================================',
            )
            if (bal.slv)
                bal.slv({
                    gthBit: { idx: 'trigger-task-rollback', val: 1, dat: data },
                })
        } else {
            await logConsole(
                `>> [HTTP ${res.status}] :: ${rtt}ms RTT :: ROLLBACK ABORTED`,
            )
            await logConsole(
                '>> ==============================================================',
            )
            if (bal.slv)
                bal.slv({
                    gthBit: {
                        idx: 'trigger-task-rollback-err',
                        val: 0,
                        dat: data,
                    },
                })
        }
    } catch (err: any) {
        await logConsole(`>> [SAGA TRIGGER ERROR]: ${err.message}`)
        if (bal.slv)
            bal.slv({
                gthBit: {
                    idx: 'trigger-task-rollback-err',
                    val: 0,
                    src: err.message,
                },
            })
    }
    return cpy
}

/**
 * Fetches the last 5 commits from local git repository.
 */
export const fetchRecentCommits = async (
    cpy: GithubModel,
    bal: GithubBit,
    ste: State,
) => {
    try {
        const { stdout } = await execAsync(
            'git log -n 5 --pretty=format:"%h%x09%s%x09%an%x09%ar"',
        )
        const commits = stdout
            .trim()
            .split('\n')
            .filter(Boolean)
            .map((line) => {
                const [shortSha, subject, author, relativeDate] =
                    line.split('\t')
                return { shortSha, subject, author, relativeDate }
            })

        if (bal.slv)
            bal.slv({ gthBit: { idx: 'fetch-recent-commits', lst: commits } })
    } catch (err: any) {
        await logConsole(`>> [GIT LOG ERROR]: ${err.message}`)
        if (bal.slv)
            bal.slv({ gthBit: { idx: 'fetch-recent-commits-err', lst: [] } })
    }
    return cpy
}

/**
 * Inspects and prints commit details and projected discarded commits to cns00.
 */
export const previewCommitDetails = async (
    cpy: GithubModel,
    bal: GithubBit,
    ste: State,
) => {
    const sha = bal.src || bal.dat?.shortSha
    if (!sha) {
        if (bal.slv) bal.slv({ gthBit: { idx: 'preview-commit-err', val: 0 } })
        return cpy
    }

    try {
        const { stdout: commitInfo } = await execAsync(
            `git show -s --format="Full SHA: %H%nAuthor:   %an <%ae>%nDate:     %ad%n%n%B" ${sha}`,
        )
        const { stdout: discarded } = await execAsync(
            `git log --oneline ${sha}..HEAD`,
        )
        const discardedList = discarded.trim().split('\n').filter(Boolean)

        await logConsole(
            '>> ==============================================================',
        )
        await logConsole(`>> [HARD RESET TARGET PREVIEW]`)
        await logConsole(
            '>> --------------------------------------------------------------',
        )
        for (const line of commitInfo.trim().split('\n')) {
            await logConsole(`>> ${line}`)
        }
        await logConsole(
            '>> --------------------------------------------------------------',
        )
        await logConsole(
            `>> COMMITS TO BE DISCARDED (${discardedList.length}):`,
        )
        if (discardedList.length === 0) {
            await logConsole(
                '>>   (HEAD is already at this commit - zero commits discarded)',
            )
        } else {
            for (const d of discardedList) {
                await logConsole(`>>   - ${d}`)
            }
        }
        await logConsole(
            '>> ==============================================================',
        )

        if (bal.slv)
            bal.slv({
                gthBit: {
                    idx: 'preview-commit-details',
                    val: 1,
                    dat: { sha, discardedCount: discardedList.length },
                },
            })
    } catch (err: any) {
        await logConsole(`>> [PREVIEW ERROR]: ${err.message}`)
        if (bal.slv) bal.slv({ gthBit: { idx: 'preview-commit-err', val: 0 } })
    }
    return cpy
}

/**
 * Enacts local git reset --hard and immediately pushes rewritten ref upstream with --force-with-lease.
 */
export const executeHardReset = async (
    cpy: GithubModel,
    bal: GithubBit,
    ste: State,
) => {
    const sha = bal.src || bal.dat?.sha
    if (!sha) {
        await logConsole('>> [ERROR] Missing target SHA for hard reset.')
        if (bal.slv)
            bal.slv({ gthBit: { idx: 'execute-hard-reset-err', val: 0 } })
        return cpy
    }

    await logConsole(
        '>> ==============================================================',
    )
    await logConsole(
        `>> [STEP 1/2] Enacting local git reset --hard onto ${sha}...`,
    )

    const t0 = Date.now()
    try {
        const { stdout: branchOut } = await execAsync(
            'git rev-parse --abbrev-ref HEAD',
        )
        const currentBranch = branchOut.trim()

        const { stdout: resetOut } = await execAsync(`git reset --hard ${sha}`)
        const resetRtt = Date.now() - t0

        await logConsole(`>> [LOCAL RESET OK] :: ${resetRtt}ms RTT`)
        await logConsole(`>> ${resetOut.trim()}`)
        await logConsole(`>> Target Branch: ${currentBranch}`)

        await logConsole(
            '>> --------------------------------------------------------------',
        )
        await logConsole(
            `>> [STEP 2/2] Pushing rewritten ref to origin/${currentBranch}...`,
        )

        const t1 = Date.now()
        const { stdout: pushOut, stderr: pushErr } = await execAsync(
            `git push origin ${currentBranch} --force-with-lease`,
        )
        const pushRtt = Date.now() - t1

        const combinedPushMsg = (
            pushOut ||
            pushErr ||
            'Everything up-to-date'
        ).trim()
        await logConsole(`>> [REMOTE PUSH OK] :: ${pushRtt}ms RTT`)
        await logConsole(`>> GitHub Status: ${combinedPushMsg}`)
        await logConsole(
            `>> [STATUS] Local working tree and remote origin/${currentBranch} locked at ${sha}`,
        )
        await logConsole(
            '>> ==============================================================',
        )

        if (bal.slv) {
            bal.slv({
                gthBit: {
                    idx: 'execute-hard-reset',
                    val: 1,
                    dat: {
                        sha,
                        branch: currentBranch,
                        totalRtt: Date.now() - t0,
                    },
                },
            })
        }
    } catch (err: any) {
        await logConsole(`>> [PIPELINE FAILURE]: ${err.message}`)
        await logConsole(
            '>> [WARNING] Local reset may have occurred, but upstream push failed.',
        )
        await logConsole(
            '>> ==============================================================',
        )
        if (bal.slv)
            bal.slv({
                gthBit: {
                    idx: 'execute-hard-reset-err',
                    val: 0,
                    src: err.message,
                },
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

/**
 * Automates GitHub webhook provisioning and edge DO registration in a single step.
 */
export const registerWatchedRepo = async (
    cpy: GithubModel,
    bal: GithubBit,
    ste: State,
) => {
    const rawInput = bal.src || bal.dat?.url
    if (!rawInput) {
        await logConsole('>> [ERROR] No repository slug or URL provided.')
        if (bal.slv)
            bal.slv({ gthBit: { idx: 'register-watched-repo-err', val: 0 } })
        return cpy
    }

    const cleaned = rawInput
        .replace(/^https:\/\/github\.com\//, '')
        .replace(/\.git$/, '')
        .trim()
    const [owner, repo] = cleaned.split('/')

    if (!owner || !repo) {
        await logConsole(
            `>> [ERROR] Invalid repository format: "${rawInput}". Expected "owner/repo" or full URL`,
        )
        if (bal.slv)
            bal.slv({ gthBit: { idx: 'register-watched-repo-err', val: 0 } })
        return cpy
    }

    const ghToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN
    const webhookSecret =
        process.env.GH_WEBHOOK_SECRET || process.env.GITHUB_WEBHOOK_SECRET || ''
    const baseUrl = getBaseUrl()
    const webhookPayloadUrl = `${baseUrl}/webhooks/github`

    await logConsole(
        '>> ==============================================================',
    )
    await logConsole(
        `>> [AUTO-PROVISION] Setting up surveillance for ${owner}/${repo}...`,
    )

    let hookCreated = false

    // STEP 1: Automate GitHub Webhook Creation via REST API
    await logConsole(
        `>> [STEP 1/2] Installing GitHub Webhook on ${owner}/${repo}...`,
    )
    if (!ghToken) {
        await logConsole(
            '>> [WARNING] GITHUB_TOKEN not found in terminal env. Skipping GitHub webhook creation.',
        )
    } else {
        const t0 = Date.now()
        try {
            const hookRes = await fetch(
                `https://api.github.com/repos/${owner}/${repo}/hooks`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `token ${ghToken}`,
                        'Accept': 'application/vnd.github+json',
                        'User-Agent': 'Repo-Bot-Flight-Deck',
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        name: 'web',
                        active: true,
                        events: [
                            'pull_request',
                            'push',
                            'check_run',
                            'check_suite',
                            'issue_comment',
                        ],
                        config: {
                            url: webhookPayloadUrl,
                            content_type: 'json',
                            secret: webhookSecret,
                            insecure_ssl: '0',
                        },
                    }),
                },
            )

            const rtt = Date.now() - t0
            const hookData: any = await hookRes.json()

            if (hookRes.status === 201) {
                await logConsole(
                    `>> [WEBHOOK INSTALLED] ID: ${hookData.id} [OK] (${rtt}ms RTT)`,
                )
                hookCreated = true
            } else if (
                hookRes.status === 422 &&
                hookData.errors?.[0]?.message?.includes('already exists')
            ) {
                await logConsole(
                    `>> [WEBHOOK EXISTS] Repository already configured with webhook [OK] (${rtt}ms RTT)`,
                )
                hookCreated = true
            } else {
                await logConsole(
                    `>> [WEBHOOK WARNING] GitHub returned HTTP ${hookRes.status}: ${hookData.message || 'Error'}`,
                )
            }
        } catch (hookErr: any) {
            await logConsole(`>> [WEBHOOK ERROR]: ${hookErr.message}`)
        }
    }

    // STEP 2: Register in Edge Durable Object Control Plane
    await logConsole(
        '>> --------------------------------------------------------------',
    )
    await logConsole(
        `>> [STEP 2/2] Registering in Repo-Bot Edge Control Plane...`,
    )

    const t1 = Date.now()
    try {
        const doRes = await fetch(`${baseUrl}/repos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: `https://github.com/${owner}/${repo}`,
            }),
        })

        const rtt = Date.now() - t1
        const doData: any = await doRes.json()

        if (doRes.ok) {
            await logConsole(
                `>> [DO REGISTERED] Target: ${doData.repo?.id || `${owner}/${repo}`} [OK] (${rtt}ms RTT)`,
            )
            await logConsole(
                '>> --------------------------------------------------------------',
            )
            await logConsole(
                `>> [STATUS] SURVEILLANCE ACTIVE. Events streaming to #ops-bridge.`,
            )
            await logConsole(
                '>> ==============================================================',
            )
            if (bal.slv)
                bal.slv({
                    gthBit: {
                        idx: 'register-watched-repo',
                        val: 1,
                        dat: { hookCreated, doData },
                    },
                })
        } else {
            await logConsole(
                `>> [DO ERROR] HTTP ${doRes.status}: ${doData.error || 'Failed to register'}`,
            )
            await logConsole(
                '>> ==============================================================',
            )
            if (bal.slv)
                bal.slv({
                    gthBit: {
                        idx: 'register-watched-repo-err',
                        val: 0,
                        dat: doData,
                    },
                })
        }
    } catch (doErr: any) {
        await logConsole(`>> [DO NETWORK ERROR]: ${doErr.message}`)
        await logConsole(
            '>> ==============================================================',
        )
        if (bal.slv)
            bal.slv({
                gthBit: {
                    idx: 'register-watched-repo-err',
                    val: 0,
                    src: doErr.message,
                },
            })
    }

    return cpy
}

/**
 * Lists all repositories currently under active edge surveillance.
 */
export const listWatchedRepos = async (
    cpy: GithubModel,
    bal: GithubBit,
    ste: State,
) => {
    const baseUrl = getBaseUrl()
    await logConsole(
        '>> ==============================================================',
    )
    await logConsole(
        '>> [WATCHED REPOSITORIES] Querying active fleet from edge DO...',
    )

    const t0 = Date.now()
    try {
        const res = await fetch(`${baseUrl}/repos`)
        const rtt = Date.now() - t0
        const repos: any[] = await res.json()

        if (Array.isArray(repos) && repos.length > 0) {
            await logConsole(
                `>> [HTTP 200 OK] :: ${rtt}ms RTT :: Total Watched: ${repos.length}`,
            )
            await logConsole(
                '>> --------------------------------------------------------------',
            )
            for (const [idx, r] of repos.entries()) {
                await logConsole(`>> [${idx + 1}] ${r.id} (${r.url})`)
            }
            await logConsole(
                '>> ==============================================================',
            )
            if (bal.slv)
                bal.slv({ gthBit: { idx: 'list-watched-repos', lst: repos } })
        } else {
            await logConsole(
                `>> [HTTP 200 OK] :: ${rtt}ms RTT :: No repositories currently watched.`,
            )
            await logConsole(
                '>> ==============================================================',
            )
            if (bal.slv)
                bal.slv({ gthBit: { idx: 'list-watched-repos', lst: [] } })
        }
    } catch (err: any) {
        await logConsole(`>> [QUERY ERROR]: ${err.message}`)
        await logConsole(
            '>> ==============================================================',
        )
        if (bal.slv)
            bal.slv({ gthBit: { idx: 'list-watched-repos-err', lst: [] } })
    }
    return cpy
}
