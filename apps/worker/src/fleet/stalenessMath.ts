export type RunnerHealthRating =
    'HEALTHY' | 'DEGRADED' | 'STALE' | 'DEAD_ZOMBIE'

export interface StalenessMetrics {
    deltaMs: number
    effectiveDeltaMs: number
    healthScore: number
    rating: RunnerHealthRating
    isEligible: boolean
}

export interface CompositeHealthResult {
    timeHealth: number
    memoryHealth: number
    compositeScore: number
    isEligible: boolean
    rating: RunnerHealthRating
}

export const NOMINAL_HEARTBEAT_INTERVAL_MS = 10_000 // tau = 10s
export const JITTER_TOLERANCE_BUFFER_MS = 2_500 // epsilon = 2.5s
export const HALF_LIFE_DECAY_MS = 15_000 // T_1/2 = 15s
export const HARD_EVICTION_THRESHOLD_MS = 60_000 // T_evict = 60s
export const MIN_ALLOCATION_HEALTH_SCORE = 0.5 // Minimum health to pull tasks

/**
 * Calculates temporal staleness using exponential decay with network jitter absorption.
 */
export function calculateTimeStaleness(
    lastHeartbeatMs: number,
    nowMs: number = Date.now(),
): StalenessMetrics {
    const deltaMs = Math.max(0, nowMs - lastHeartbeatMs)
    const graceWindow =
        NOMINAL_HEARTBEAT_INTERVAL_MS + JITTER_TOLERANCE_BUFFER_MS

    // Hard boundary: Runner dead beyond 60 seconds
    if (deltaMs >= HARD_EVICTION_THRESHOLD_MS) {
        return {
            deltaMs,
            effectiveDeltaMs: deltaMs - graceWindow,
            healthScore: 0.0,
            rating: 'DEAD_ZOMBIE',
            isEligible: false,
        }
    }

    // Within nominal window + network jitter tolerance: perfect health
    if (deltaMs <= graceWindow) {
        return {
            deltaMs,
            effectiveDeltaMs: 0,
            healthScore: 1.0,
            rating: 'HEALTHY',
            isEligible: true,
        }
    }

    // Calculate exponential decay past jitter window
    const effectiveDeltaMs = deltaMs - graceWindow
    const lambda = Math.LN2 / HALF_LIFE_DECAY_MS
    const rawScore = Math.exp(-lambda * effectiveDeltaMs)
    const healthScore = Math.round(rawScore * 1000) / 1000

    let rating: RunnerHealthRating = 'HEALTHY'
    if (healthScore >= 0.85) {
        rating = 'HEALTHY'
    } else if (healthScore >= MIN_ALLOCATION_HEALTH_SCORE) {
        rating = 'DEGRADED'
    } else {
        rating = 'STALE'
    }

    return {
        deltaMs,
        effectiveDeltaMs,
        healthScore,
        rating,
        isEligible: healthScore >= MIN_ALLOCATION_HEALTH_SCORE,
    }
}

/**
 * Computes composite health combining temporal staleness and VRAM memory headroom.
 */
export function calculateCompositeHealth(
    timeHealth: number,
    vramFreeMb: number,
    requiredVramMb: number,
): CompositeHealthResult {
    if (timeHealth <= 0.0 || vramFreeMb <= 0) {
        return {
            timeHealth,
            memoryHealth: 0.0,
            compositeScore: 0.0,
            isEligible: false,
            rating: 'DEAD_ZOMBIE',
        }
    }

    const memoryRatio =
        requiredVramMb > 0 ? Math.min(1.0, vramFreeMb / requiredVramMb) : 1.0
    const memoryHealth = Math.round(memoryRatio * 1000) / 1000

    const rawComposite = timeHealth * memoryHealth
    const compositeScore = Math.round(rawComposite * 1000) / 1000

    const meetsVram = requiredVramMb <= 0 || vramFreeMb >= requiredVramMb
    const isEligible =
        compositeScore >= MIN_ALLOCATION_HEALTH_SCORE && meetsVram

    let rating: RunnerHealthRating = 'HEALTHY'
    if (compositeScore >= 0.85 && meetsVram) {
        rating = 'HEALTHY'
    } else if (compositeScore >= MIN_ALLOCATION_HEALTH_SCORE && meetsVram) {
        rating = 'DEGRADED'
    } else if (timeHealth > 0.0) {
        rating = 'STALE'
    } else {
        rating = 'DEAD_ZOMBIE'
    }

    return {
        timeHealth,
        memoryHealth,
        compositeScore,
        isEligible,
        rating,
    }
}
