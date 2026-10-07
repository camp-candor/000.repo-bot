export type TimerType = 'WATCHDOG' | 'ABSOLUTE_CAP'
export type TimerId = 'watchdog' | 'absolute_cap'

export interface ScheduledTimer {
    id: TimerId
    type: TimerType
    fireAt: number
    epoch: number
    epochScoped: boolean
}

export interface PollResult {
    due: ScheduledTimer[]
    remaining: ScheduledTimer[]
}

/**
 * Schedules or replaces a timer by its deterministic ID and sorts ascending by fireAt.
 */
export function scheduleTimer(
    timers: ScheduledTimer[],
    newTimer: ScheduledTimer,
): ScheduledTimer[] {
    const filtered = timers.filter((t) => t.id !== newTimer.id)
    filtered.push(newTimer)
    return filtered.sort((a, b) => a.fireAt - b.fireAt)
}

/**
 * Cancels a timer by its deterministic ID.
 */
export function cancelTimer(
    timers: ScheduledTimer[],
    id: TimerId,
): ScheduledTimer[] {
    return timers.filter((t) => t.id !== id)
}

/**
 * Returns the earliest fire timestamp among active timers, or null if empty.
 */
export function getEarliestFireTime(timers: ScheduledTimer[]): number | null {
    if (timers.length === 0) return null
    return timers[0].fireAt
}

/**
 * Partitions timers into due and remaining. Drops stale epoch-scoped timers.
 */
export function pollDueTimers(
    timers: ScheduledTimer[],
    now: number,
    currentEpoch: number,
): PollResult {
    const due: ScheduledTimer[] = []
    const remaining: ScheduledTimer[] = []

    for (const timer of timers) {
        // Drop stale epoch-scoped timers
        if (timer.epochScoped && timer.epoch !== currentEpoch) {
            console.log(
                `>> [TIMER:DISCARD] Dropping stale ${timer.id} timer (Epoch ${timer.epoch} != ${currentEpoch}) [OK]`,
            )
            continue
        }

        if (timer.fireAt <= now) {
            due.push(timer)
        } else {
            remaining.push(timer)
        }
    }

    return { due, remaining: remaining.sort((a, b) => a.fireAt - b.fireAt) }
}
