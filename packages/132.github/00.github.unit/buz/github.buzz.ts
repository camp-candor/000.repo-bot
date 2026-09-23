import crypto from 'node:crypto'
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

export const initGithub = (cpy: GithubModel, bal: GithubBit, ste: State) => {
    const urlgithub = 'https://zero00-github.onrender.com/api/github/test'

    fetch(urlgithub)
        .then((res) => {
            if (!res.ok) throw new Error('Network response was not ok')
            return res.json()
        })
        .then((data) => {
            if (bal.slv != null) {
                bal.slv({
                    intBit: {
                        idx: 'init-github',
                        dat: {
                            github: data,
                        },
                    },
                })
            }
        })
        .catch((err) => {
            if (bal.slv != null) {
                bal.slv({
                    intBit: { idx: 'init-github-err', dat: err.message },
                })
            }
        })

    return cpy
}

export const updateGithub = (cpy: GithubModel, bal: GithubBit, ste: State) => {
    if (bal.slv != null) bal.slv({ intBit: { idx: 'update-github' } })
    return cpy
}

/**
 * OPTION 1: End-to-End Synthetic Webhook Smoke Test
 * Sends live HTTP wire traffic to the active worker isolate (/webhooks/github):
 * 1. Negative control: forged HMAC signature (asserts 401 Unauthorized)
 * 2. Positive control: authentic HMAC signature on PR open (asserts 202 AUDIT_DISPATCHED)
 */
export const testGithub = async (
    cpy: GithubModel,
    bal: GithubBit,
    ste: State,
) => {
    const baseUrl =
        (global as any).agentBaseUrl ||
        process.env.LOCAL_WORKER_URL ||
        process.env.WORKER_URL ||
        'http://127.0.0.1:8787'

    const webhookUrl = `${baseUrl.replace(/\/$/, '')}/webhooks/github`
    const secret =
        process.env.GITHUB_WEBHOOK_SECRET || 'super_secret_webhook_key'

    await logConsole('>> ==================================================')
    await logConsole(`>> [SMOKE TEST] Target: ${webhookUrl}`)
    await logConsole('>> ==================================================')

    // Synthetic pull request payload targeting 000.repo-bot
    const payload = {
        action: 'opened',
        number: 101,
        pull_request: {
            number: 101,
            head: {
                sha: '9f8e7d6c5b4a3a2b1c0d9e8f7a6b5c4d3e2f1a0b',
            },
            body: 'Automated task spec delivery.\n<!-- file_whitelist: ["apps/worker/src/index.ts"] -->',
        },
        repository: {
            name: '000.repo-bot',
            owner: {
                login: 'camp-candor',
            },
        },
    }

    const rawBody = JSON.stringify(payload)

    // Compute authentic HMAC-SHA256 signature
    const hmac = crypto.createHmac('sha256', secret)
    hmac.update(rawBody)
    const validSignature = `sha256=${hmac.digest('hex')}`
    const forgedSignature =
        'sha256=0000000000000000000000000000000000000000000000000000000000000000'

    let negPassed = false
    let posPassed = false
    let posLatency = 0
    let posData: any = null

    try {
        // ------------------------------------------------------------------------
        // CASE 1: Negative Control (Tampered Signature -> HTTP 401)
        // ------------------------------------------------------------------------
        await logConsole('>> 1. Dispatching forged signature...')
        const t0Neg = Date.now()
        const resNeg = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-GitHub-Event': 'pull_request',
                'X-GitHub-Delivery': crypto.randomUUID(),
                'X-Hub-Signature-256': forgedSignature,
            },
            body: rawBody,
        })
        const durNeg = Date.now() - t0Neg

        if (resNeg.status === 401) {
            negPassed = true
            await logConsole(
                `>> [HTTP 401 OK] :: ${durNeg}ms :: FORGED SIGNATURE BLOCKED`,
            )
        } else {
            await logConsole(
                `>> [HTTP ${resNeg.status} FAIL] :: Expected 401 Unauthorized`,
            )
        }

        // ------------------------------------------------------------------------
        // CASE 2: Positive Control (Valid Signed PR -> HTTP 202 AUDIT_DISPATCHED)
        // ------------------------------------------------------------------------
        await logConsole('>> 2. Dispatching authentic signed PR event...')
        const t0Pos = Date.now()
        const resPos = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-GitHub-Event': 'pull_request',
                'X-GitHub-Delivery': crypto.randomUUID(),
                'X-Hub-Signature-256': validSignature,
            },
            body: rawBody,
        })
        posLatency = Date.now() - t0Pos
        posData = await resPos.json().catch(() => null)

        if (resPos.status === 202 && posData?.status === 'AUDIT_DISPATCHED') {
            posPassed = true
            await logConsole(
                `>> [HTTP 202 OK] :: ${posLatency}ms :: WEBHOOK ACCEPTED & DISPATCHED`,
            )
            await logConsole(
                `>> Context: PR #${posData.pr} @ ${posData.sha.slice(0, 7)}`,
            )
        } else {
            await logConsole(
                `>> [HTTP ${resPos.status} FAIL] :: Response: ${JSON.stringify(posData)}`,
            )
        }

        await logConsole(
            '>> ==================================================',
        )
        const overallTag =
            negPassed && posPassed
                ? '[SMOKE TEST PASSED]'
                : '[SMOKE TEST FAILED]'
        await logConsole(
            `>> ${overallTag} :: Fast-Exit < 50ms: ${posLatency < 50 ? 'YES' : 'NO'}`,
        )
        await logConsole(
            '>> ==================================================',
        )
    } catch (err: any) {
        await logConsole(`>> [SMOKE ERROR]: ${err.message}`)
    }

    if (bal.slv != null) {
        bal.slv({
            gthBit: {
                idx: 'test-github',
                val: negPassed && posPassed ? 1 : 0,
                dat: {
                    negPassed,
                    posPassed,
                    latency: posLatency,
                    response: posData,
                },
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
    const lst = ['github-repo-1', 'github-repo-2']
    if (bal.slv != null) bal.slv({ gthBit: { idx: 'list-github', lst } })
    return cpy
}
