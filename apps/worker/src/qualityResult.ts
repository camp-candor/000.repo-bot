import type { Context } from 'hono'
import type { Env } from './tools.js'
import { emitCanonicalEvent } from './events/eventHub.js'
import { sanitizeToAscii } from './events/eventEnvelope.js'

export interface GitHubCheckRunPayload {
    action: string
    check_run: {
        id: number
        name: string
        head_sha: string
        status: 'queued' | 'in_progress' | 'completed'
        conclusion:
            | 'success'
            | 'failure'
            | 'neutral'
            | 'cancelled'
            | 'timed_out'
            | 'action_required'
            | null
        check_suite?: {
            head_branch: string | null
        }
        output?: {
            title: string | null
            summary: string | null
        }
    }
    repository: {
        owner: { login: string }
        name: string
        full_name: string
    }
}

/**
 * Deterministically extracts the Task ID from a tracking branch name.
 * Format: spec/{taskId}-{shortSha}
 */
export function extractTaskIdFromBranch(
    branchName: string | null | undefined,
): string | null {
    if (!branchName) return null
    const match = branchName.match(/^spec\/([a-zA-Z0-9._-]+)-[a-fA-F0-9]+$/)
    return match ? match[1] : null
}

/**
 * Ingests check_run completion webhooks, enforces idempotency, and drives FSM transitions.
 */
export async function handleCheckRunEvent(
    c: Context<{ Bindings: Env }>,
    payload: GitHubCheckRunPayload,
) {
    const deliveryId = c.req.header('X-GitHub-Delivery') || 'unknown'
    const { check_run } = payload

    // 1. Filter strictly for the quality gauntlet check run
    if (check_run.name !== 'repo-bot/quality-gauntlet') {
        return c.json(
            { status: 'IGNORED_CHECK_RUN', name: check_run.name },
            200,
        )
    }

    // Extract Task ID from branch (avoids D1 projection lag)
    const branchName = check_run.check_suite?.head_branch
    const taskId = extractTaskIdFromBranch(branchName)

    // 2. Only process completed evaluations
    if (payload.action !== 'completed' || check_run.status !== 'completed') {
        return c.json({ status: 'IN_PROGRESS_WAITING' }, 200)
    }

    if (check_run.conclusion !== 'success') {
        const rawOutput =
            check_run.output?.summary || check_run.output?.title || 'Check run failed'
        const cleanLog = sanitizeToAscii(rawOutput)

        emitCanonicalEvent(c.env, {
            domain: 'GOVERNANCE',
            type: 'CHECK_FAILURE',
            source: 'GitHubCheckRunner',
            correlationId: taskId || 'unknown',
            payload: {
                checkRunId: check_run.id,
                runName: check_run.name,
                repository: payload.repository?.full_name || 'camp-candor/000.repo-bot',
                targetBranch: branchName || 'unknown',
                headSha: check_run.head_sha,
                taskId: taskId || 'unknown',
                category: check_run.conclusion || 'failure',
                primaryError: cleanLog.slice(0, 140),
                logExcerpt: cleanLog.slice(0, 500),
            },
            ascii: `>> [CHECK FAILURE] ${taskId}@${check_run.head_sha.slice(0, 7)}: '${check_run.name}' [${check_run.conclusion}]`,
        }).catch(() => {})
    }

    if (!taskId) {
        return c.json(
            { error: 'CANNOT_EXTRACT_TASK_ID_FROM_BRANCH', branch: branchName },
            400,
        )
    }

    // 4. Atomic Idempotency Gate
    const idempotencyKey = `quality:${deliveryId}:${taskId}:${check_run.head_sha}:${check_run.conclusion}`
    if ((c.env as any).DB) {
        try {
            const insertRes = await (c.env as any).DB.prepare(
                `INSERT INTO webhook_deliveries (delivery_id, received_at)
                 VALUES (?1, ?2)
                 ON CONFLICT(delivery_id) DO NOTHING`,
            )
                .bind(idempotencyKey, Date.now())
                .run()

            if (insertRes.meta && insertRes.meta.changes === 0) {
                return c.json(
                    { status: 'DUPLICATE_CHECK_RUN_IGNORED', idempotencyKey },
                    200,
                )
            }
        } catch (err: any) {
            console.warn('Check run idempotency query bypassed:', err.message)
        }
    }

    // 5. Forward to RepoBotDO instance managing this task
    const doId = (c.env as any).REPO_BOT_DO.idFromName(taskId)
    const taskDO = (c.env as any).REPO_BOT_DO.get(doId)

    const fsmEvent =
        check_run.conclusion === 'success'
            ? 'QUALITY_PASS'
            : 'QUALITY_FAIL_RETRY'

    const forwardPayload = {
        type: fsmEvent,
        actor: 'CI_RUNNER',
        taskId,
        headSha: check_run.head_sha,
        conclusion: check_run.conclusion,
        summary: check_run.output?.summary || '',
        timestamp: Date.now(),
    }

    const doRes = await taskDO.fetch(
        new Request('https://internal/fsm/transition', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(forwardPayload),
        }),
    )

    if (!doRes.ok) {
        const errorText = await doRes.text()
        return c.json(
            { error: 'DO_TRANSITION_FAILED', details: errorText },
            500,
        )
    }

    const transitionOutcome: any = await doRes.json()
    return c.json(
        { status: 'PROCESSED', taskId, fsmEvent, transitionOutcome },
        200,
    )
}
