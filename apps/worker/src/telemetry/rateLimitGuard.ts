export interface RateLimitState {
    limit: number
    remaining: number
    resetEpochSec: number
    updatedAtMs: number
}

export interface RateLimitGuardOptions {
    safetyReserveFloor?: number
    alertThreshold?: number
    onThrottleAlert?: (remaining: number, resetEpochSec: number) => void
}

export const DEFAULT_SAFETY_RESERVE_FLOOR = 500
export const DEFAULT_ALERT_THRESHOLD = 1000

export class RateLimitGuard {
    private state: RateLimitState
    private readonly safetyReserveFloor: number
    private readonly alertThreshold: number
    private readonly onThrottleAlert?: (
        remaining: number,
        resetEpochSec: number,
    ) => void

    constructor(options: RateLimitGuardOptions = {}) {
        this.safetyReserveFloor =
            options.safetyReserveFloor ?? DEFAULT_SAFETY_RESERVE_FLOOR
        this.alertThreshold = options.alertThreshold ?? DEFAULT_ALERT_THRESHOLD
        this.onThrottleAlert = options.onThrottleAlert

        this.state = {
            limit: 5000,
            remaining: 5000,
            resetEpochSec: Math.floor(Date.now() / 1000) + 3600,
            updatedAtMs: Date.now(),
        }
    }

    /**
     * Returns an immutable snapshot of the current rate-limit budget.
     */
    public getState(): Readonly<RateLimitState> {
        return { ...this.state }
    }

    /**
     * Extracts GitHub rate-limit headers from an HTTP response and updates state.
     */
    public updateFromHeaders(headers: Headers): RateLimitState {
        const limitHeader = headers.get('x-ratelimit-limit')
        const remainingHeader = headers.get('x-ratelimit-remaining')
        const resetHeader = headers.get('x-ratelimit-reset')

        if (limitHeader) {
            this.state.limit = parseInt(limitHeader, 10)
        }

        if (remainingHeader) {
            this.state.remaining = parseInt(remainingHeader, 10)
        }

        if (resetHeader) {
            this.state.resetEpochSec = parseInt(resetHeader, 10)
        }

        this.state.updatedAtMs = Date.now()

        if (this.state.remaining <= this.alertThreshold) {
            console.warn(
                `>> [RATE_LIMIT:ALERT] GitHub quota low: ${this.state.remaining}/${this.state.limit} remaining (Resets at ${new Date(this.state.resetEpochSec * 1000).toISOString()}) [WARN]`,
            )
            this.onThrottleAlert?.(
                this.state.remaining,
                this.state.resetEpochSec,
            )
        }

        return { ...this.state }
    }

    /**
     * Enforces the Safety Reserve Floor before outbound API execution.
     * Non-critical reference reads fail-closed when quota drops below the safety floor.
     */
    public assertQuotaAvailable(isCritical = false): void {
        const nowSec = Math.floor(Date.now() / 1000)

        // If reset window has passed, tentatively restore quota
        if (nowSec >= this.state.resetEpochSec) {
            this.state.remaining = this.state.limit
            this.state.resetEpochSec = nowSec + 3600
        }

        if (!isCritical && this.state.remaining <= this.safetyReserveFloor) {
            const resetIso = new Date(
                this.state.resetEpochSec * 1000,
            ).toISOString()
            const errorMsg = `GITHUB_RATE_LIMIT_EXHAUSTED: Remaining quota (${this.state.remaining}) is below safety reserve floor (${this.safetyReserveFloor}). Blocking non-critical request until reset at ${resetIso}.`
            console.error(`>> [RATE_LIMIT:BLOCKED] ${errorMsg} [FAIL]`)
            throw new Error(errorMsg)
        }
    }

    /**
     * Executes an HTTP request with proactive rate-limit protection and header telemetry extraction.
     */
    public async executeWithQuotaProtection(
        requestFn: () => Promise<Response>,
        isCritical = false,
    ): Promise<Response> {
        this.assertQuotaAvailable(isCritical)
        const response = await requestFn()
        this.updateFromHeaders(response.headers)
        return response
    }
}
