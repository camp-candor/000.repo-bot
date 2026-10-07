import { ensureIdempotencySchema } from '../ledger/idempotency.js'

export interface GarbageCollectionReport {
    idempotencyPurged: number
    staleBranchesPruned: number
    stagingArtifactsPurged: number
    timestampMs: number
}

/**
 * Purges idempotency keys older than the specified retention window (default: 7 days).
 */
export async function purgeExpiredIdempotencyKeys(
    db: any,
    olderThanMs = 7 * 86_400_000,
): Promise<{ purgedCount: number }> {
    if (!db) {
        return { purgedCount: 0 }
    }

    await ensureIdempotencySchema(db)

    const cutoffMs = Date.now() - olderThanMs
    const res = await db
        .prepare(
            `DELETE FROM idempotency_keys
         WHERE created_at < ?`,
        )
        .bind(cutoffMs)
        .run()

    const purgedCount = Number(res?.meta?.changes || 0)
    console.log(
        `>> [SWEP:IDEMPOTENCY] Purged ${purgedCount} expired idempotency keys older than ${new Date(cutoffMs).toISOString()} [OK]`,
    )
    return { purgedCount }
}

/**
 * 03:00 UTC Scheduled Garbage Collector Daemon.
 */
export async function runDailyGarbageCollection(
    env: any,
): Promise<GarbageCollectionReport> {
    const now = Date.now()
    console.log(
        `>> [SWEP:INGRESS] Running Daily 03:00 UTC Garbage Collection at tick ${now}`,
    )

    let idempotencyPurged = 0
    if (env?.DB) {
        const purgeRes = await purgeExpiredIdempotencyKeys(env.DB)
        idempotencyPurged = purgeRes.purgedCount
    }

    // Stubs for future GC layers (branch cleanup, R2 scratch)
    const report: GarbageCollectionReport = {
        idempotencyPurged,
        staleBranchesPruned: 0,
        stagingArtifactsPurged: 0,
        timestampMs: now,
    }

    console.log(
        `>> [SWEP:COMPLETE] GC finished: ${idempotencyPurged} keys purged [OK]`,
    )
    return report
}

/**
 * Backward-compatible entrypoint consumed by scheduledRouter ('0 3 * * *').
 */
export const sweepStaleRecords = (env: any): Promise<GarbageCollectionReport> =>
    runDailyGarbageCollection(env)
