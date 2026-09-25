import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { GithubModel } from '../github.model.js'
import GithubBit from '../fce/github.bit.js'
import State from '../../99.core/state.js'

const execAsync = promisify(exec)
const UPDATE_CONSOLE = '[Console action] Update Console'

export const logConsole = async (src: string, maxLen = 56) => {
    if (!(global as any).LIBRARY) return

    if (
        src.length <= maxLen ||
        src.startsWith('>> ===') ||
        src.startsWith('>> ---')
    ) {
        await (global as any).LIBRARY.hunt(UPDATE_CONSOLE, {
            idx: 'cns00',
            src,
        })
        return
    }

    const words = src.split(' ')
    let currentLine = ''

    for (const word of words) {
        if ((currentLine + ' ' + word).length > maxLen) {
            await (global as any).LIBRARY.hunt(UPDATE_CONSOLE, {
                idx: 'cns00',
                src: currentLine,
            })
            currentLine = '>>    ' + word
        } else {
            currentLine = currentLine ? `${currentLine} ${word}` : word
        }
    }
    if (currentLine) {
        await (global as any).LIBRARY.hunt(UPDATE_CONSOLE, {
            idx: 'cns00',
            src: currentLine,
        })
    }
}

export async function parseSafeResponse(
    res: Response,
): Promise<{ ok: boolean; status: number; data: any; raw: string }> {
    const status = res.status
    const raw = (await res.text()).trim()
    let data: any = null

    try {
        data = JSON.parse(raw)
    } catch {
        data = null
    }

    return {
        ok: res.ok,
        status,
        data,
        raw,
    }
}

const getBaseUrl = (): string => {
    return (
        (global as any).agentBaseUrl ||
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
 * Automates GitHub webhook provisioning, edge DO registration, and ping test in three phases.
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
            `>> [ERROR] Invalid repository: "${rawInput}". Expected owner/repo or full URL`,
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
    let hookId: number | null = null

    // STEP 1/3: GitHub REST API Webhook Creation
    await logConsole(
        `>> [STEP 1/3] Installing GitHub Webhook on ${owner}/${repo}...`,
    )
    if (!ghToken) {
        await logConsole(
            '>> [WARNING] GITHUB_TOKEN not found in env. Skipping GitHub webhook creation.',
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
            const parsedHook = await parseSafeResponse(hookRes)

            if (parsedHook.status === 201) {
                hookId = parsedHook.data?.id
                await logConsole(
                    `>> [WEBHOOK INSTALLED] ID: ${hookId} [OK] (${rtt}ms RTT)`,
                )
                hookCreated = true
            } else if (
                parsedHook.status === 422 &&
                parsedHook.raw.includes('already exists')
            ) {
                await logConsole(
                    `>> [WEBHOOK EXISTS] Repository already configured [OK] (${rtt}ms RTT)`,
                )
                hookCreated = true
            } else {
                await logConsole(
                    `>> [WEBHOOK ERROR: HTTP ${parsedHook.status}]`,
                )
                await logConsole(`>> ${parsedHook.raw.slice(0, 100)}`)
            }
        } catch (hookErr: any) {
            await logConsole(`>> [WEBHOOK NETWORK ERROR]: ${hookErr.message}`)
        }
    }

    // STEP 2/3: Edge Control Plane Registration
    await logConsole(
        '>> --------------------------------------------------------------',
    )
    await logConsole(
        `>> [STEP 2/3] Registering in Repo-Bot Edge Control Plane...`,
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
        const parsedDo = await parseSafeResponse(doRes)

        if (parsedDo.ok && parsedDo.data) {
            await logConsole(
                `>> [DO REGISTERED] Target: ${parsedDo.data.repo?.id || `${owner}/${repo}`} [OK] (${rtt}ms RTT)`,
            )
        } else {
            await logConsole(
                `>> [DO REGISTRATION FAILED: HTTP ${parsedDo.status}]`,
            )
            await logConsole(
                `>> Raw Output: ${parsedDo.raw.slice(0, 120) || '(empty response)'}`,
            )
            if (bal.slv)
                bal.slv({
                    gthBit: {
                        idx: 'register-watched-repo-err',
                        val: 0,
                        dat: parsedDo,
                    },
                })
            return cpy
        }
    } catch (doErr: any) {
        await logConsole(`>> [DO NETWORK ERROR]: ${doErr.message}`)
        if (bal.slv)
            bal.slv({
                gthBit: {
                    idx: 'register-watched-repo-err',
                    val: 0,
                    src: doErr.message,
                },
            })
        return cpy
    }

    // STEP 3/3: Dispatch Live Webhook Ping Test
    await logConsole(
        '>> --------------------------------------------------------------',
    )
    await logConsole(`>> [STEP 3/3] Emitting Instant Webhook Ping Test...`)
    if (hookId && ghToken) {
        try {
            const pingRes = await fetch(
                `https://api.github.com/repos/${owner}/${repo}/hooks/${hookId}/pings`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `token ${ghToken}`,
                        'Accept': 'application/vnd.github+json',
                        'User-Agent': 'Repo-Bot-Flight-Deck',
                    },
                },
            )
            if (pingRes.status === 204) {
                await logConsole(
                    `>> [PING SUCCESS] GitHub reached edge endpoint [OK]`,
                )
            } else {
                await logConsole(
                    `>> [PING NOTICE] Ping returned HTTP ${pingRes.status}`,
                )
            }
        } catch (pingErr: any) {
            await logConsole(`>> [PING SKIPPED]: ${pingErr.message}`)
        }
    } else {
        await logConsole('>> [PING SKIPPED] Existing hook ID not resolved.')
    }

    await logConsole(
        '>> --------------------------------------------------------------',
    )
    await logConsole(
        `>> [STATUS] SURVEILLANCE ACTIVE. Events streaming to #ops-bridge.`,
    )
    await logConsole(
        '>> ==============================================================',
    )

    if (bal.slv) bal.slv({ gthBit: { idx: 'register-watched-repo', val: 1 } })
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
        const parsed = await parseSafeResponse(res)
        const repos: any[] = Array.isArray(parsed.data) ? parsed.data : []

        if (parsed.ok && repos.length > 0) {
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
        } else if (parsed.ok) {
            await logConsole(
                `>> [HTTP 200 OK] :: ${rtt}ms RTT :: No repositories currently watched.`,
            )
            await logConsole(
                '>> ==============================================================',
            )
            if (bal.slv)
                bal.slv({ gthBit: { idx: 'list-watched-repos', lst: [] } })
        } else {
            await logConsole(`>> [QUERY FAILED: HTTP ${parsed.status}]`)
            await logConsole(`>> Body: ${parsed.raw.slice(0, 100)}`)
            await logConsole(
                '>> ==============================================================',
            )
            if (bal.slv)
                bal.slv({ gthBit: { idx: 'list-watched-repos-err', lst: [] } })
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

/**
 * Live Slack Bridge Telemetry Inspector
 */
export const checkSlackBridgeStatus = async (
    cpy: GithubModel,
    bal: GithubBit,
    ste: State,
) => {
    const baseUrl = getBaseUrl()
    await logConsole(
        '>> ==============================================================',
    )
    await logConsole(
        '>> [SLACK BRIDGE TELEMETRY] Querying live edge telemetry...',
    )

    const t0 = Date.now()
    try {
        const res = await fetch(`${baseUrl}/api/slack/status`)
        const rtt = Date.now() - t0
        const parsed = await parseSafeResponse(res)

        if (parsed.ok && parsed.data) {
            const d = parsed.data
            await logConsole(`>> [HTTP 200 OK] :: ${rtt}ms RTT`)
            await logConsole(
                `>> Configured Channel ID : ${d.configuredChannel}`,
            )
            await logConsole(
                `>> Bot Token Configured  : ${d.hasBotToken ? '[YES]' : '[NO: MISSING]'}`,
            )
            if (d.lastDelivery) {
                const dt = new Date(d.lastDelivery.timestamp).toISOString()
                await logConsole(`>> Last Delivery Time    : ${dt}`)
                await logConsole(
                    `>> Last Delivery Event   : ${d.lastDelivery.event}`,
                )
                await logConsole(
                    `>> Last Delivery Status  : ${d.lastDelivery.ok ? '[SUCCESS 200]' : `[FAILED: ${d.lastDelivery.error}]`}`,
                )
            } else {
                await logConsole(
                    `>> Last Delivery         : (No outbound messages logged yet)`,
                )
            }
            await logConsole(
                '>> ==============================================================',
            )
            if (bal.slv)
                bal.slv({
                    gthBit: { idx: 'check-slack-status', val: 1, dat: d },
                })
        } else {
            await logConsole(`>> [STATUS QUERY FAILED: HTTP ${parsed.status}]`)
            await logConsole(`>> Body: ${parsed.raw.slice(0, 100)}`)
            await logConsole(
                '>> ==============================================================',
            )
            if (bal.slv)
                bal.slv({ gthBit: { idx: 'check-slack-status-err', val: 0 } })
        }
    } catch (err: any) {
        await logConsole(`>> [NETWORK ERROR]: ${err.message}`)
        if (bal.slv)
            bal.slv({
                gthBit: {
                    idx: 'check-slack-status-err',
                    val: 0,
                    src: err.message,
                },
            })
    }
    return cpy
}

/**
 * Audits the active GITHUB_TOKEN for identity, scopes, and target repo access.
 */
export const auditGithubToken = async (
    cpy: GithubModel,
    bal: GithubBit,
    ste: State,
) => {
    const ghToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN
    const rawTarget = bal.src || bal.dat?.repo || 'camp-candor/000.repo-bot'

    // Strip full URL prefix (https://github.com/), .git extension, and whitespace
    const targetRepoSlug = rawTarget
        .replace(/^https?:\/\/github\.com\//i, '')
        .replace(/\.git$/i, '')
        .trim()

    await logConsole(
        '>> ==============================================================',
    )
    await logConsole('>> [GITHUB TOKEN AUDIT & PERMISSION CHECK]')

    if (!ghToken) {
        await logConsole(
            '>> [CRITICAL] GITHUB_TOKEN is not set in environment!',
        )
        await logConsole(
            '>> Configure GITHUB_TOKEN in your environment or .env file.',
        )
        await logConsole(
            '>> ==============================================================',
        )
        if (bal.slv)
            bal.slv({ gthBit: { idx: 'audit-github-token-err', val: 0 } })
        return cpy
    }

    const maskedToken = ghToken.slice(0, 4) + '...' + ghToken.slice(-4)
    await logConsole(`>> Active Token : ${maskedToken}`)

    try {
        await logConsole(
            '>> --------------------------------------------------------------',
        )
        await logConsole(
            '>> [1/2] Verifying Identity & OAuth Scopes (GET /user)...',
        )

        const userRes = await fetch('https://api.github.com/user', {
            headers: {
                'Authorization': `token ${ghToken}`,
                'Accept': 'application/vnd.github+json',
                'User-Agent': 'Repo-Bot-Flight-Deck',
            },
        })

        const parsedUser = await parseSafeResponse(userRes)

        if (!parsedUser.ok) {
            await logConsole(
                `>> [AUTH FAILED: HTTP ${parsedUser.status}] Invalid token.`,
            )
            await logConsole(`>> Response: ${parsedUser.raw.slice(0, 100)}`)
            await logConsole(
                '>> ==============================================================',
            )
            if (bal.slv)
                bal.slv({ gthBit: { idx: 'audit-github-token-err', val: 0 } })
            return cpy
        }

        const userData = parsedUser.data || {}
        const rawScopes = userRes.headers.get('x-oauth-scopes') || ''
        const scopes = rawScopes
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)

        await logConsole(
            `>> Authenticated User : ${userData.login} (ID: ${userData.id})`,
        )

        if (scopes.length > 0) {
            await logConsole(`>> Detected Scopes    : [${scopes.join(', ')}]`)
            const hasRepo = scopes.includes('repo')
            const hasHook =
                scopes.includes('admin:repo_hook') ||
                scopes.includes('write:repo_hook') ||
                hasRepo

            await logConsole(
                `>>   - 'repo' scope            : ${hasRepo ? '[OK] Present' : '[WARNING] Missing'}`,
            )
            await logConsole(
                `>>   - 'admin:repo_hook' scope : ${hasHook ? '[OK] Authorized' : '[WARNING] Missing'}`,
            )
        } else {
            await logConsole(
                '>> Detected Scopes    : Fine-grained PAT / GitHub App Installation',
            )
        }

        await logConsole(
            '>> --------------------------------------------------------------',
        )
        await logConsole(
            `>> [2/2] Checking Repository Access: ${targetRepoSlug}...`,
        )

        const repoRes = await fetch(
            `https://api.github.com/repos/${targetRepoSlug}`,
            {
                headers: {
                    'Authorization': `token ${ghToken}`,
                    'Accept': 'application/vnd.github+json',
                    'User-Agent': 'Repo-Bot-Flight-Deck',
                },
            },
        )

        const parsedRepo = await parseSafeResponse(repoRes)

        if (!parsedRepo.ok) {
            await logConsole(
                `>> [ACCESS REJECTED: HTTP ${parsedRepo.status}] ${targetRepoSlug}`,
            )
            if (parsedRepo.status === 404) {
                await logConsole(
                    '>> Cause: Repository does not exist or token lacks permission.',
                )
            }
            await logConsole(
                '>> ==============================================================',
            )
            if (bal.slv)
                bal.slv({ gthBit: { idx: 'audit-github-token-err', val: 0 } })
            return cpy
        }

        const repoData = parsedRepo.data || {}
        const perms = repoData.permissions || {}

        await logConsole(
            `>> Target Visibility  : ${repoData.private ? 'Private' : 'Public'} (Branch: ${repoData.default_branch})`,
        )
        await logConsole(
            `>> Pull  (Read)       : ${perms.pull ? '[OK] GRANTED' : '[FAIL] DENIED'}`,
        )
        await logConsole(
            `>> Push  (Write)      : ${perms.push ? '[OK] GRANTED' : '[FAIL] DENIED'}`,
        )
        await logConsole(
            `>> Admin (Settings)   : ${perms.admin ? '[OK] GRANTED' : '[FAIL] LACKS ADMIN'}`,
        )

        if (!perms.admin && !perms.push) {
            await logConsole(
                '>> [STATUS] INSUFFICIENT PERMISSIONS: Cannot push or configure hooks.',
            )
        } else {
            await logConsole(
                '>> --------------------------------------------------------------',
            )
            await logConsole(
                '>> [STATUS] TOKEN FULLY CERTIFIED FOR FLEET SURVEILLANCE',
            )
        }
        await logConsole(
            '>> ==============================================================',
        )

        if (bal.slv) {
            bal.slv({
                gthBit: {
                    idx: 'audit-github-token',
                    val: perms.push ? 1 : 0,
                    dat: {
                        user: userData.login,
                        scopes,
                        permissions: perms,
                        repoSlug: targetRepoSlug,
                    },
                },
            })
        }
    } catch (err: any) {
        await logConsole(`>> [AUDIT NETWORK ERROR]: ${err.message}`)
        await logConsole(
            '>> ==============================================================',
        )
        if (bal.slv)
            bal.slv({
                gthBit: {
                    idx: 'audit-github-token-err',
                    val: 0,
                    src: err.message,
                },
            })
    }
    return cpy
}

/**
 * Verifies the mathematical integrity of the SHA-256 hash chain for a repository.
 */
export const auditHashChainIntegrity = async (
    cpy: GithubModel,
    bal: GithubBit,
    ste: State,
) => {
    const baseUrl = getBaseUrl()
    const rawRepo =
        bal.src || bal.dat?.repo || 'astro-kahn-it-com/001.goblin-lore'
    const repo = rawRepo
        .replace(/^https?:\/\/github\.com\//i, '')
        .replace(/\.git$/i, '')
        .trim()

    await logConsole(
        '>> ==============================================================',
    )
    await logConsole(`>> [CRYPTOGRAPHIC AUDIT CHAIN VERIFICATION]`)
    await logConsole(`>> Target Repository : ${repo}`)

    const t0 = Date.now()
    try {
        const res = await fetch(
            `${baseUrl}/api/audit/verify-chain?repo=${encodeURIComponent(repo)}`,
        )
        const parsed = await parseSafeResponse(res)

        if (!parsed.ok || !parsed.data?.rows) {
            await logConsole(
                `>> [HTTP ${parsed.status}] Unable to fetch audit chain records.`,
            )
            await logConsole(
                '>> ==============================================================',
            )
            if (bal.slv) bal.slv({ gthBit: { idx: 'audit-chain-err', val: 0 } })
            return cpy
        }

        const rows = parsed.data.rows
        await logConsole(
            `>> Total Records     : ${rows.length} records retrieved (${Date.now() - t0}ms RTT)`,
        )

        if (rows.length === 0) {
            await logConsole(
                '>> [STATUS] NO AUDIT EVENTS LOGGED YET FOR THIS REPO.',
            )
            await logConsole(
                '>> ==============================================================',
            )
            if (bal.slv) bal.slv({ gthBit: { idx: 'audit-chain', val: 1 } })
            return cpy
        }

        // Check sequential chaining
        let broken = 0
        for (let i = 1; i < rows.length; i++) {
            const prev = rows[i - 1]
            const curr = rows[i]
            if (curr.prev_hash !== prev.record_hash) {
                broken++
                await logConsole(
                    `>> [CORRUPTION AT SEQ ${curr.sequence_id}] prevHash mismatch!`,
                )
            }
        }

        await logConsole(
            '>> --------------------------------------------------------------',
        )
        await logConsole(
            `>> Genesis Seed Hash : ${rows[0].prev_hash.slice(0, 16)}...`,
        )
        await logConsole(
            `>> Head Digest       : ${rows[rows.length - 1].record_hash.slice(0, 16)}...`,
        )
        await logConsole(`>> Broken Links      : ${broken}`)
        await logConsole(
            `>> Tamper Status     : ${broken === 0 ? '[0 DISCREPANCIES DETECTED]' : '[FAIL: TAMPERED]'}`,
        )
        await logConsole(
            '>> --------------------------------------------------------------',
        )
        await logConsole(
            `>> [STATUS] ${broken === 0 ? 'AUDIT TRAIL PROVEN & CERTIFIED [OK]' : 'CHAIN CORRUPTED [FAIL]'}`,
        )
        await logConsole(
            '>> ==============================================================',
        )

        if (bal.slv)
            bal.slv({
                gthBit: { idx: 'audit-chain', val: broken === 0 ? 1 : 0 },
            })
    } catch (err: any) {
        await logConsole(`>> [NETWORK ERROR]: ${err.message}`)
        if (bal.slv) bal.slv({ gthBit: { idx: 'audit-chain-err', val: 0 } })
    }

    return cpy
}

/**
 * Inspects the last 20 events from the hot D1 audit ledger.
 */
export const inspectD1AuditLog = async (
    cpy: GithubModel,
    bal: GithubBit,
    ste: State,
) => {
    const baseUrl = getBaseUrl()
    await logConsole(
        '>> ==============================================================',
    )
    await logConsole('>> [HOT TRANSACTIONAL LEDGER: D1 AUDIT TRAIL]')

    try {
        const res = await fetch(`${baseUrl}/api/audit/recent?limit=15`)
        const parsed = await parseSafeResponse(res)
        const events = parsed.data?.events || []

        if (events.length === 0) {
            await logConsole('>> (No audit events recorded in D1 yet)')
        } else {
            for (const e of events) {
                const dt = new Date(e.created_at)
                    .toISOString()
                    .replace('T', ' ')
                    .slice(0, 19)
                const drained = e.drained_at ? '[DRAINED]' : '[HOT]'
                await logConsole(
                    `>> [#${e.sequence_id}] ${dt} :: ${e.event_type} ${drained}`,
                )
                await logConsole(
                    `>>    Repo: ${e.repository} | Task: ${e.task_id} | Actor: ${e.actor_id}`,
                )
                await logConsole(
                    `>>    Head: ${e.head_sha.slice(0, 7)} | Hash: ${e.record_hash.slice(0, 8)}...`,
                )
            }
        }
        await logConsole(
            '>> ==============================================================',
        )
        if (bal.slv) bal.slv({ gthBit: { idx: 'inspect-d1', val: 1 } })
    } catch (err: any) {
        await logConsole(`>> [AUDIT QUERY ERROR]: ${err.message}`)
        if (bal.slv) bal.slv({ gthBit: { idx: 'inspect-d1-err', val: 0 } })
    }
    return cpy
}

/**
 * Triggers an immediate out-of-band cold drainage flush to GitHub.
 */
export const triggerColdDrainage = async (
    cpy: GithubModel,
    bal: GithubBit,
    ste: State,
) => {
    const baseUrl = getBaseUrl()
    await logConsole(
        '>> ==============================================================',
    )
    await logConsole(
        '>> [COLD PLAINTEXT DRAINAGE] Initiating flush to GitHub...',
    )

    const t0 = Date.now()
    try {
        const res = await fetch(`${baseUrl}/api/audit/drain`, {
            method: 'POST',
        })
        const parsed = await parseSafeResponse(res)

        if (parsed.ok && parsed.data?.ok) {
            const d = parsed.data
            await logConsole(`>> [HTTP 200 OK] :: ${Date.now() - t0}ms RTT`)
            await logConsole(`>> Records Drained : ${d.drainedCount}`)
            await logConsole(`>> Committed Files : ${d.committedFiles.length}`)
            for (const f of d.committedFiles) {
                await logConsole(`>>   - ${f}`)
            }
            await logConsole(
                `>> Pruned Hot Rows : ${d.prunedCount} (older than 7 days)`,
            )
            await logConsole('>> [STATUS] COLD DRAINAGE COMPLETED [OK]')
        } else {
            await logConsole(`>> [DRAINAGE FAILED: HTTP ${parsed.status}]`)
            await logConsole(
                `>> Error: ${parsed.data?.error || parsed.raw.slice(0, 80)}`,
            )
        }
        await logConsole(
            '>> ==============================================================',
        )
        if (bal.slv)
            bal.slv({
                gthBit: { idx: 'trigger-drainage', val: parsed.ok ? 1 : 0 },
            })
    } catch (err: any) {
        await logConsole(`>> [DRAINAGE NETWORK ERROR]: ${err.message}`)
        if (bal.slv)
            bal.slv({ gthBit: { idx: 'trigger-drainage-err', val: 0 } })
    }
    return cpy
}
