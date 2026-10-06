import type { TaskState, FSMEvent } from '../fsm/transitions.js'

export interface OutboxRecord {
    id: string
    taskId: string
    attemptNumber: number
    sequenceNumber: number
    fromState: TaskState
    toState: TaskState
    event: FSMEvent
    epoch: number
    actor: string
    reason?: string
    payloadJson: string
    timestampMs: number
    createdAtMs: number
    attempts: number
}

export interface DrainResult {
    drainedCount: number
    errors?: string[]
}

/**
 * Executes a deterministic, atomic batch projection from OutboxRecords to D1.
 */
export async function drainOutboxBatch(
    db: any,
    records: OutboxRecord[],
): Promise<DrainResult> {
    if (!db || records.length === 0) {
        return { drainedCount: 0 }
    }

    const statements: any[] = []

    for (const record of records) {
        // 1. Immutable Event Store Projection
        statements.push(
            db
                .prepare(
                    `INSERT INTO task_events (
            event_id, task_id, attempt_number, sequence_number, from_state,
            event, to_state, actor, reason, epoch, payload_json, timestamp_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(task_id, sequence_number) DO NOTHING`,
                )
                .bind(
                    record.id,
                    record.taskId,
                    record.attemptNumber,
                    record.sequenceNumber,
                    record.fromState,
                    record.event,
                    record.toState,
                    record.actor,
                    record.reason || null,
                    record.epoch,
                    record.payloadJson,
                    record.timestampMs,
                ),
        )

        // 2. Hot Tasks Projection Table
        statements.push(
            db
                .prepare(
                    `UPDATE tasks
         SET current_status = ?,
             current_attempt_number = ?,
             updated_at_ms = ?
         WHERE task_id = ?`,
                )
                .bind(
                    record.toState,
                    record.attemptNumber,
                    record.timestampMs,
                    record.taskId,
                ),
        )

        // 3. Task Attempts History Projection Table
        statements.push(
            db
                .prepare(
                    `UPDATE task_attempts
         SET status = ?,
             last_projected_epoch = ?,
             exit_reason = COALESCE(?, exit_reason),
             completed_at_ms = CASE WHEN ? IN ('MERGED', 'ROLLED_BACK', 'DLQ', 'HALTED') THEN ? ELSE completed_at_ms END
         WHERE task_id = ? AND attempt_number = ?`,
                )
                .bind(
                    record.toState,
                    record.epoch,
                    record.reason || null,
                    record.toState,
                    record.timestampMs,
                    record.taskId,
                    record.attemptNumber,
                ),
        )
    }

    try {
        await db.batch(statements)
        return { drainedCount: records.length }
    } catch (err: any) {
        const errorMsg = `D1_BATCH_DRAIN_FAILED: ${err.message}`
        console.error(`>> [OUTBOX DRAIN ERROR] ${errorMsg}`)
        throw new Error(errorMsg)
    }
}
