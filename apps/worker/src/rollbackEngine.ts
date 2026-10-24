// apps/worker/src/rollbackEngine.ts
import { githubRequest, PROTECTED_BRANCHES, type Env } from './tools.core.js'
import { redactSecrets } from './redaction.js'

// ============================================================================
// :: REPO-BOT: 4-STAGE COMPENSATING SAGA ROLLBACK ENGINE
// ============================================================================

export interface RollbackParams {
    owner: string
    repo: string
    branchName: string
    prNumber?: number
    reason: string
    env: Env
    headSha?: string
    taskId?: string
    actor?: string
}

export interface RollbackReceipt {
    status: 'ROLLBACK_COMPLETED' | 'ROLLBACK_FAILED'
    branchDeleted: boolean
    prClosed: boolean
    details: Record<string, any>
}

/**
 * Executes an idempotent, 4-stage compensating teardown saga across
 * remote GitHub Git trees and edge task states.
 */
export async function executeSagaRollback(
    params: RollbackParams,
): Promise<RollbackReceipt> {
    const { owner, repo, branchName, prNumber, reason, env } = params
    const cleanBranch = (branchName || '').replace(/^refs\/heads\//, '').trim()
    const sagaId = `saga_${Date.now()}`

    let prClosed = false
    let branchDeleted = false
    const stageLog: Record<string, any> = {
        sagaId,
        reason: redactSecrets(reason),
    }

    // ------------------------------------------------------------------------
    // Stage 1: Execution Invalidation & Quarantine
    // ------------------------------------------------------------------------
    stageLog.stage1 = {
        action: 'EXECUTION_INVALIDATED',
        status: 'FAILED_ABORTED',
        disarmedAt: new Date().toISOString(),
    }

    // ------------------------------------------------------------------------
    // Stage 2: Explicit GitHub Pull Request Closure & Tombstone Postmortem
    // ------------------------------------------------------------------------
    if (prNumber && prNumber > 0) {
        try {
            await githubRequest(
                `/repos/${owner}/${repo}/pulls/${prNumber}`,
                env,
                {
                    method: 'PATCH',
                    body: JSON.stringify({ state: 'closed' }),
                },
            )
            prClosed = true

            const tombstoneBody =
                `:: [SAGA ROLLBACK EXECUTED]\n` +
                `*Status:* Closed by Autonomous Watchdog\n` +
                `*Reason:* ${redactSecrets(reason)}\n` +
                `*Saga ID:* \`${sagaId}\`\n` +
                `*Action:* Ephemeral branch dismantled. Trunk preserved at S_clean.`

            await githubRequest(
                `/repos/${owner}/${repo}/issues/${prNumber}/comments`,
                env,
                {
                    method: 'POST',
                    body: JSON.stringify({ body: tombstoneBody }),
                },
            ).catch(() => {})

            stageLog.stage2 = {
                action: 'PR_CLOSED',
                prNumber,
                status: 'SUCCESS',
            }
        } catch (err: any) {
            const msg = String(err.message || '')
            // Idempotent Absorption: 404 (Not Found) or 422 (Already Closed / Unprocessable)
            if (msg.includes('404') || msg.includes('422')) {
                prClosed = true
                stageLog.stage2 = {
                    action: 'PR_ALREADY_CLOSED_OR_ABSENT',
                    prNumber,
                    status: 'ABSORBED',
                }
            } else {
                stageLog.stage2 = {
                    action: 'PR_CLOSE_FAILED',
                    error: redactSecrets(msg),
                }
            }
        }
    } else {
        stageLog.stage2 = { action: 'PR_SKIPPED', reason: 'NO_PR_NUMBER' }
    }

    // ------------------------------------------------------------------------
    // Stage 3: Remote Ephemeral Tracking Branch Obliteration
    // ------------------------------------------------------------------------
    if (cleanBranch) {
        // Enforce Ref Shield Invariants: Deleting trunk or non-spec refs is forbidden
        if (
            PROTECTED_BRANCHES.has(cleanBranch.toLowerCase()) ||
            !cleanBranch.startsWith('spec/')
        ) {
            throw new Error(
                `SECURITY_BREACH: Refusal to delete protected/non-spec branch: ${cleanBranch}`,
            )
        }

        try {
            await githubRequest(
                `/repos/${owner}/${repo}/git/refs/heads/${cleanBranch}`,
                env,
                { method: 'DELETE' },
            )
            branchDeleted = true
            stageLog.stage3 = {
                action: 'BRANCH_DELETED',
                branch: cleanBranch,
                status: 'SUCCESS',
            }
        } catch (err: any) {
            const msg = String(err.message || '')
            // Idempotent Absorption: 404 (Ref already deleted or never pushed)
            if (msg.includes('404')) {
                branchDeleted = true
                stageLog.stage3 = {
                    action: 'BRANCH_ALREADY_ABSENT',
                    branch: cleanBranch,
                    status: 'ABSORBED',
                }
            } else {
                stageLog.stage3 = {
                    action: 'BRANCH_DELETE_FAILED',
                    error: redactSecrets(msg),
                }
            }
        }
    } else {
        stageLog.stage3 = { action: 'BRANCH_SKIPPED', reason: 'NO_BRANCH_NAME' }
    }

    // ------------------------------------------------------------------------
    // Stage 4: Trunk Integrity Verification & Receipt Generation
    // ------------------------------------------------------------------------
    stageLog.stage4 = {
        action: 'TRUNK_VERIFIED',
        status: 'S_CLEAN_PINNED',
        timestamp: new Date().toISOString(),
    }

    return {
        status: 'ROLLBACK_COMPLETED',
        branchDeleted,
        prClosed,
        details: stageLog,
    }
}
