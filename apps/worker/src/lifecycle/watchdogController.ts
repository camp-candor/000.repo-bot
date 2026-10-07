import type { ExecutionJob } from '../queue/fairQueue.js'

export type WatchdogEvaluation =
    'RETRY_REQUIRED' | 'DLQ_REQUIRED' | 'IGNORE_ABORTED' | 'IGNORE_EMPTY'

export class WatchdogController {
    /**
     * Arms the hardware alarm to enforce a strict execution lease ceiling.
     */
    public static async armWatchdog(
        ctx: any,
        taskId: string,
        timeoutMs = 30000,
    ): Promise<void> {
        const triggerTime = Date.now() + timeoutMs
        await ctx.storage.setAlarm(triggerTime)
        console.log(
            `>> [WATCHDOG:ARMED] Execution lease armed for '${taskId}'. Ceiling: ${timeoutMs}ms [OK]`,
        )
    }

    /**
     * Disarms the hardware alarm, neutralizing the watchdog timer.
     */
    public static async disarmWatchdog(
        ctx: any,
        taskId: string,
    ): Promise<void> {
        await ctx.storage.deleteAlarm()
        console.log(
            `>> [WATCHDOG:DISARM] Execution lease disarmed for '${taskId}' [OK]`,
        )
    }

    /**
     * Evaluates the active state machine when an alarm fires to prevent race conditions.
     */
    public static evaluateAlarm(
        activeJob: ExecutionJob | null,
        fsmState: string,
    ): WatchdogEvaluation {
        if (!activeJob) {
            console.log(
                '>> [WATCHDOG:EVAL] Alarm fired but activeJob is null [IGNORE_EMPTY]',
            )
            return 'IGNORE_EMPTY'
        }

        if (fsmState === 'ABORTED') {
            console.warn(
                `>> [WATCHDOG:RACE_GUARD] Alarm fired for aborted task '${activeJob.taskId}'. Neutralizing execution [IGNORE_ABORTED]`,
            )
            return 'IGNORE_ABORTED'
        }

        if (activeJob.attemptCount + 1 < activeJob.maxAttempts) {
            console.warn(
                `>> [WATCHDOG:TRIP] Lease timeout for task '${activeJob.taskId}'. Escalation required [RETRY_REQUIRED]`,
            )
            return 'RETRY_REQUIRED'
        }

        console.error(
            `>> [WATCHDOG:FATAL] Attempt budget exhausted for task '${activeJob.taskId}'. DLQ insertion required [DLQ_REQUIRED]`,
        )
        return 'DLQ_REQUIRED'
    }
}
