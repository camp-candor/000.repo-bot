export interface ActiveTimerMetadata {
    epoch: number
    type: 'WATCHDOG' | 'ABSOLUTE' | 'APPROVAL'
    deadlineMs: number
    armedAtMs: number
}

export class TimerScheduler {
    private readonly TIMER_STORAGE_KEY = 'active_timer'

    constructor(private readonly storage: DurableObjectStorage) {}

    /**
     * Arms a proactive storage alarm with epoch tagging.
     */
    async armWatchdog(
        timeoutMs: number,
        epoch: number,
    ): Promise<ActiveTimerMetadata> {
        const now = Date.now()
        const deadlineMs = now + timeoutMs
        const metadata: ActiveTimerMetadata = {
            epoch,
            type: 'WATCHDOG',
            deadlineMs,
            armedAtMs: now,
        }

        await this.storage.put(this.TIMER_STORAGE_KEY, metadata)
        await this.storage.setAlarm(deadlineMs)
        return metadata
    }

    /**
     * Unconditionally disarms the watchdog alarm and removes metadata.
     */
    async disarmWatchdog(): Promise<void> {
        await this.storage.delete(this.TIMER_STORAGE_KEY)
        await this.storage.deleteAlarm()
    }

    /**
     * Retrieves active timer metadata from persistent storage.
     */
    async getActiveTimer(): Promise<ActiveTimerMetadata | undefined> {
        return await this.storage.get<ActiveTimerMetadata>(
            this.TIMER_STORAGE_KEY,
        )
    }

    /**
     * Validates whether the active alarm belongs to the specified epoch.
     */
    async isAlarmValidForEpoch(currentEpoch: number): Promise<boolean> {
        const timer = await this.getActiveTimer()
        if (!timer) return false
        return timer.epoch === currentEpoch
    }
}
