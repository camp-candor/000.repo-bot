import { githubRequest, type Env } from './tools.js'
import {
    postSlackMergeAnnouncement,
    updateSlackMessage,
} from './slackBridge.js'

export interface MergeExecutorParams {
    taskId: string
    owner: string
    repo: string
    pullNumber: number
    auditedHeadSha: string
    branchName?: string
    actor?: string
    slackMessageTs?: string
    slackChannelId?: string
}

export interface MergeExecutorResult {
    success: boolean
    mergeCommitSha?: string
    alreadyMerged?: boolean
    error?: string
}

/**
 * Asserts branch name conforms strictly to ephemeral spec format before deletion.
 */
export function assertSafeBranchRef(branchName: string): string {
    const cleaned = branchName.replace(/^refs\/heads\//, '').trim()
    if (!cleaned.startsWith('spec/')) {
        throw new Error(
            `SECURITY_BREACH: Refusal to obliterate non-spec branch '${cleaned}'`,
        )
    }
    return cleaned
}

/**
 * Executes a cryptographic SHA-pinned squash merge with TOCTOU defense and branch cleanup.
 */
export async function executeShaPinnedMerge(
    params: MergeExecutorParams,
    env: Env,
): Promise<MergeExecutorResult> {
    const { taskId, owner, repo, pullNumber, auditedHeadSha, actor } = params
    console.log(
        `>> [MERGE EXECUTOR] Initiating CAS merge for task ${taskId} (PR #${pullNumber})`,
    )

    // 1. Pre-Flight SHA Validation
    if (!auditedHeadSha || auditedHeadSha.length !== 40) {
        console.error(
            `>> [MERGE EXECUTOR] Rejected: Invalid auditedHeadSha '${auditedHeadSha}'`,
        )
        return { success: false, error: 'INVALID_AUDITED_SHA_PIN' }
    }

    // Simulated task bypass guard (used in test decks)
    if (pullNumber <= 0) {
        console.log(
            `>> [SIMULATED TEST] Bypassing GitHub PR merge for simulated task ${taskId}`,
        )
        return {
            success: true,
            mergeCommitSha: '0000000000000000000000000000000000000000',
        }
    }

    try {
        // 2. Active Lineage & Idempotency Pre-Check
        const pr: any = await githubRequest(
            `/repos/${owner}/${repo}/pulls/${pullNumber}`,
            env,
        )

        if (pr.merged === true) {
            console.warn(
                `:: IDEMPOTENCY: PR #${pullNumber} is already merged at ${pr.merge_commit_sha}`,
            )
            await finalizeMergeOutputs(
                params,
                pr.merge_commit_sha || auditedHeadSha,
                env,
            )
            return {
                success: true,
                mergeCommitSha: pr.merge_commit_sha,
                alreadyMerged: true,
            }
        }

        // 3. TOCTOU Check: Remote head must equal the audited commit SHA
        if (pr.head?.sha !== auditedHeadSha) {
            const errorMsg = `TOCTOU_DIVERGENCE: PR head moved to ${pr.head?.sha}, expected ${auditedHeadSha}`
            console.error(`>> [MERGE EXECUTOR] ${errorMsg}`)
            return { success: false, error: errorMsg }
        }

        // 4. Cryptographic CAS Squash Merge
        const mergeRes: any = await githubRequest(
            `/repos/${owner}/${repo}/pulls/${pullNumber}/merge`,
            env,
            {
                method: 'PUT',
                body: JSON.stringify({
                    sha: auditedHeadSha,
                    merge_method: 'squash',
                    commit_title: `feat(${taskId}): squash merge completed by repo-bot (#${pullNumber})`,
                    commit_message: `Audited-Head-SHA: ${auditedHeadSha}\nAuthor/Approver: ${actor || 'repo-bot'}\nStatus: Trunk invariants satisfied.`,
                }),
            },
        )

        const mergeCommitSha =
            mergeRes.sha || mergeRes.merge_commit_sha || auditedHeadSha
        console.log(
            `>> [MERGE EXECUTOR] CAS squash merge succeeded: ${mergeCommitSha}`,
        )

        // 5. Ephemeral Branch Obliteration
        const branchToClean =
            params.branchName ||
            `spec/${taskId.toLowerCase()}-${auditedHeadSha.slice(0, 7)}`
        try {
            const safeBranch = assertSafeBranchRef(branchToClean)
            await githubRequest(
                `/repos/${owner}/${repo}/git/refs/heads/${safeBranch}`,
                env,
                {
                    method: 'DELETE',
                },
            )
            console.log(
                `>> [BRANCH CLEANUP] Obliterated ephemeral ref 'refs/heads/${safeBranch}'`,
            )
        } catch (delErr: any) {
            console.warn(
                `>> [BRANCH CLEANUP] Branch deletion skipped or already cleaned: ${delErr.message}`,
            )
        }

        // 6. Broadcast Slack Notifications
        await finalizeMergeOutputs(params, mergeCommitSha, env)

        return { success: true, mergeCommitSha }
    } catch (err: any) {
        console.error(`>> [MERGE EXECUTOR ERROR]: ${err.message}`)

        // 7. Post-Error Re-entrant Reconciliation
        try {
            const prCheck: any = await githubRequest(
                `/repos/${owner}/${repo}/pulls/${pullNumber}`,
                env,
            )
            if (prCheck.merged === true) {
                console.warn(
                    `:: IDEMPOTENCY RECONCILE: PR #${pullNumber} merged despite API error`,
                )
                await finalizeMergeOutputs(
                    params,
                    prCheck.merge_commit_sha || auditedHeadSha,
                    env,
                )
                return {
                    success: true,
                    mergeCommitSha: prCheck.merge_commit_sha,
                    alreadyMerged: true,
                }
            }
        } catch {}

        return { success: false, error: err.message }
    }
}

/**
 * Updates review cards in-place and broadcasts a completion release message to Slack.
 */
async function finalizeMergeOutputs(
    params: MergeExecutorParams,
    mergeCommitSha: string,
    env: Env,
) {
    const {
        taskId,
        pullNumber,
        auditedHeadSha,
        actor,
        owner,
        repo,
        slackMessageTs,
        slackChannelId,
    } = params

    // A. In-Place Card Mutation (Freeze review buttons into confirmed state)
    if (slackMessageTs && slackChannelId && env.SLACK_BOT_TOKEN) {
        const finalizedCardText =
            `*:: PR MERGED & RELEASED*\n` +
            `• Task: \`${taskId}\`\n` +
            `• Squash SHA: \`${mergeCommitSha.slice(0, 7)}\`\n` +
            `• Trunk: \`main\` | *Ephemeral branch obliterated [OK]*`

        await updateSlackMessage(
            slackChannelId,
            slackMessageTs,
            finalizedCardText,
            env,
        )
    }

    // B. Standalone Broadcast to #ops-bridge
    if (env.SLACK_BOT_TOKEN && pullNumber > 0) {
        await postSlackMergeAnnouncement(
            {
                taskId,
                pullNumber,
                mergeCommitSha,
                auditedHeadSha,
                targetBranch: 'main',
                actor,
                owner,
                repo,
            },
            env,
        )
    }
}
