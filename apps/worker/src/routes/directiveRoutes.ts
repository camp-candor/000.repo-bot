import { Hono } from 'hono'
import type { Env } from '../tools.js'
import { ensureDirectiveLedgerSchema } from '../ledger/directiveLedger.js'

export const directiveRoutes = new Hono<{ Bindings: Env }>()

export interface DaySummaryItem {
    dayFolder: string
    badge: '[COMPLETE]' | '[IN-FLIGHT]' | '[QUEUED]'
    totalTasks: number
    mergedCount: number
    pendingCount: number
    inFlightCount: number
    failedCount: number
}

/**
 * GET /api/directives/summary
 * Computes deterministic badging ([COMPLETE], [IN-FLIGHT], [QUEUED]) per day folder for Blessed TUI.
 */
directiveRoutes.get('/summary', async (c) => {
    if (!c.env.DB) {
        return c.json({ ok: false, error: 'DATABASE_UNAVAILABLE' }, 500)
    }

    await ensureDirectiveLedgerSchema(c.env.DB)

    const { results } = await c.env.DB.prepare(
        `SELECT day_folder,
                COUNT(*) as total_count,
                SUM(CASE WHEN current_status = 'MERGED' THEN 1 ELSE 0 END) as merged_count,
                SUM(CASE WHEN current_status = 'PENDING' THEN 1 ELSE 0 END) as pending_count,
                SUM(CASE WHEN current_status IN ('CLAIMED', 'RUNNING', 'VERIFYING', 'SCOPE_PASSED', 'AWAITING_APPROVAL', 'MERGING', 'RETRYING', 'ROLLING_BACK') THEN 1 ELSE 0 END) as in_flight_count,
                SUM(CASE WHEN current_status IN ('ROLLED_BACK', 'DLQ', 'HALTED') THEN 1 ELSE 0 END) as failed_count
         FROM tasks
         GROUP BY day_folder
         ORDER BY day_folder DESC`,
    ).all()

    const rows = results || []
    const days: DaySummaryItem[] = rows.map((row: any) => {
        const total = Number(row.total_count) || 0
        const merged = Number(row.merged_count) || 0
        const pending = Number(row.pending_count) || 0
        const inFlight = Number(row.in_flight_count) || 0
        const failed = Number(row.failed_count) || 0

        let badge: '[COMPLETE]' | '[IN-FLIGHT]' | '[QUEUED]' = '[IN-FLIGHT]'
        if (total > 0 && merged === total) {
            badge = '[COMPLETE]'
        } else if (total > 0 && pending === total) {
            badge = '[QUEUED]'
        }

        return {
            dayFolder: String(row.day_folder),
            badge,
            totalTasks: total,
            mergedCount: merged,
            pendingCount: pending,
            inFlightCount: inFlight,
            failedCount: failed,
        }
    })

    return c.json({ ok: true, days })
})

/**
 * GET /api/directives/:day_folder/next-task
 * Returns the earliest unmerged directive task for the day in sequential order.
 */
directiveRoutes.get('/:day_folder/next-task', async (c) => {
    const dayFolder = c.req.param('day_folder')

    if (!c.env.DB) {
        return c.json({ ok: false, error: 'DATABASE_UNAVAILABLE' }, 500)
    }

    await ensureDirectiveLedgerSchema(c.env.DB)

    // 1. Verify if any tasks exist for this day folder
    const countRow = await c.env.DB.prepare(
        'SELECT COUNT(*) as count FROM tasks WHERE day_folder = ?',
    )
        .bind(dayFolder)
        .first()

    const taskCount = Number(countRow?.count || 0)
    if (taskCount === 0) {
        return c.json({ ok: false, error: 'NO_TASKS_FOR_DAY', dayFolder }, 404)
    }

    // 2. Locate first unmerged task in monotonic sequence order
    const nextTask = await c.env.DB.prepare(
        `SELECT task_id, contract_version, target_repo, day_folder, sequence_num,
                file_type, file_path, max_attempts, current_attempt_number,
                current_status, created_at_ms, updated_at_ms
         FROM tasks
         WHERE day_folder = ? AND current_status != 'MERGED'
         ORDER BY sequence_num ASC
         LIMIT 1`,
    )
        .bind(dayFolder)
        .first()

    if (!nextTask) {
        return c.json({ ok: true, task: null, status: 'ALL_MERGED', dayFolder })
    }

    return c.json({ ok: true, task: nextTask, dayFolder })
})

/**
 * POST /api/directives/revert-to-seal
 * Rollback endpoint: invalidates all tasks subsequent to targetDay and stamps SEAL_HARD_RESET audit event.
 */
directiveRoutes.post('/revert-to-seal', async (c) => {
    if (!c.env.DB) {
        return c.json({ ok: false, error: 'DATABASE_UNAVAILABLE' }, 500)
    }

    const body = await c.req
        .json<{
            targetDay?: string
            targetCommitSha?: string
            reason?: string
            actor?: string
        }>()
        .catch(() => null)

    if (!body || !body.targetDay || !body.targetCommitSha) {
        return c.json(
            { ok: false, error: 'MISSING_TARGET_DAY_OR_COMMIT_SHA' },
            400,
        )
    }

    const { targetDay, targetCommitSha, reason, actor } = body

    // Validate 40-character hexadecimal commit SHA pin
    if (!/^[0-9a-fA-F]{40}$/.test(targetCommitSha)) {
        return c.json({ ok: false, error: 'INVALID_COMMIT_SHA_FORMAT' }, 400)
    }

    const targetDayMatch = targetDay.match(/\d+/)
    if (!targetDayMatch) {
        return c.json({ ok: false, error: 'INVALID_TARGET_DAY_FORMAT' }, 400)
    }
    const targetDayNum = parseInt(targetDayMatch[0], 10)

    await ensureDirectiveLedgerSchema(c.env.DB)

    // 1. Discover all subsequent tasks in D1
    const { results } = await c.env.DB.prepare(
        'SELECT task_id, day_folder, current_status FROM tasks',
    ).all()

    const allTasks = results || []
    const tasksToRollback = allTasks.filter((t: any) => {
        const match = String(t.day_folder).match(/\d+/)
        if (!match) return false
        const dayNum = parseInt(match[0], 10)
        return dayNum > targetDayNum && t.current_status !== 'ROLLED_BACK'
    })

    if (tasksToRollback.length === 0) {
        return c.json({
            ok: true,
            targetDay,
            targetCommitSha,
            rolledBackCount: 0,
            affectedTaskIds: [],
            message: 'No subsequent tasks required invalidation.',
        })
    }

    const now = Date.now()
    const statements: any[] = []
    const affectedTaskIds: string[] = []

    for (const t of tasksToRollback) {
        const taskId = String(t.task_id)
        affectedTaskIds.push(taskId)

        statements.push(
            c.env.DB.prepare(
                `UPDATE tasks
                 SET current_status = 'ROLLED_BACK', updated_at_ms = ?
                 WHERE task_id = ?`,
            ).bind(now, taskId),
        )

        statements.push(
            c.env.DB.prepare(
                `INSERT INTO task_events (
                    event_id, task_id, attempt_number, sequence_number, from_state,
                    event, to_state, actor, reason, epoch, payload_json, timestamp_ms
                ) VALUES (?, ?, 1, 999, ?, 'SEAL_HARD_RESET', 'ROLLED_BACK', ?, ?, 1, ?, ?)`,
            ).bind(
                `evt-reset-${taskId}-${now}`,
                taskId,
                t.current_status,
                actor || 'operator',
                reason ||
                    `Rollback to seal ${targetDay}@${targetCommitSha.slice(0, 7)}`,
                JSON.stringify({ targetDay, targetCommitSha }),
                now,
            ),
        )
    }

    await c.env.DB.batch(statements)

    console.log(
        `>> [ROLLBACK] Reverted ${affectedTaskIds.length} task(s) past ${targetDay} to seal ${targetCommitSha.slice(0, 7)} [OK]`,
    )

    return c.json({
        ok: true,
        targetDay,
        targetCommitSha,
        rolledBackCount: affectedTaskIds.length,
        affectedTaskIds,
    })
})
