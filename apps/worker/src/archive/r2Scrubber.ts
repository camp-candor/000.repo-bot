import { verifyR2ObjectChecksum } from './bitRotDetector.js'

export interface R2ObjectInterface {
    key: string
    size: number
    customMetadata?: Record<string, string>
    uploaded: Date
}

export interface R2ObjectBodyInterface extends R2ObjectInterface {
    body: ReadableStream<Uint8Array>
    arrayBuffer(): Promise<ArrayBuffer>
}

export interface R2ObjectsInterface {
    objects: R2ObjectInterface[]
    truncated: boolean
    cursor?: string
}

export interface R2BucketInterface {
    list(options?: {
        prefix?: string
        cursor?: string
        limit?: number
        delimiter?: string
    }): Promise<R2ObjectsInterface>
    get(key: string): Promise<R2ObjectBodyInterface | null>
    put(key: string, value: any, options?: any): Promise<R2ObjectInterface>
    delete(key: string): Promise<void>
}

export interface R2ScrubOptions {
    prefix?: string
    cursor?: string
    batchLimit?: number
    quarantinePrefix?: string
}

export interface R2ScrubReport {
    batchId: string
    prefix: string
    cursor?: string
    nextCursor?: string
    isTruncated: boolean
    totalScanned: number
    healthyCount: number
    corruptedCount: number
    missingMetadataCount: number
    quarantinedKeys: string[]
    scrubbedAtMs: number
}

export const DEFAULT_SCRUB_BATCH_LIMIT = 50
export const DEFAULT_CANONICAL_PREFIX = 'canonical/renders/'
export const DEFAULT_QUARANTINE_PREFIX = 'quarantine/bit_rot/'

export class RollingR2Scrubber {
    constructor(private bucket: R2BucketInterface) {}

    /**
     * Executes a bounded rolling scrub batch across the R2 object namespace.
     */
    public async scrubBatch(
        options: R2ScrubOptions = {},
    ): Promise<R2ScrubReport> {
        const prefix = options.prefix ?? DEFAULT_CANONICAL_PREFIX
        const cursor = options.cursor
        const limit = options.batchLimit ?? DEFAULT_SCRUB_BATCH_LIMIT
        const quarantinePrefix = (
            options.quarantinePrefix ?? DEFAULT_QUARANTINE_PREFIX
        ).replace(/\/+$/, '')
        const scrubbedAtMs = Date.now()
        const batchId = `scrub-${scrubbedAtMs}`

        console.log(
            `>> [R2_SCRUB:START] Starting batch '${batchId}' on prefix '${prefix}' (Limit: ${limit}) [OK]`,
        )

        const listResult = await this.bucket.list({
            prefix,
            cursor,
            limit,
        })

        const objects = listResult.objects || []
        const quarantinedKeys: string[] = []
        let healthyCount = 0
        let corruptedCount = 0
        let missingMetadataCount = 0

        for (const meta of objects) {
            const item = await this.bucket.get(meta.key)
            if (!item) {
                console.warn(
                    `>> [R2_SCRUB:SKIP] Object '${meta.key}' disappeared during sweep [WARN]`,
                )
                continue
            }

            const expectedSha = item.customMetadata?.sha256
            const verification = await verifyR2ObjectChecksum(
                meta.key,
                item.body,
                expectedSha,
            )

            switch (verification.status) {
                case 'HEALTHY':
                    healthyCount += 1
                    break

                case 'MISSING_EXPECTED_HASH':
                    missingMetadataCount += 1
                    break

                case 'BIT_ROT_DETECTED':
                case 'STREAM_ERROR': {
                    corruptedCount += 1
                    console.error(
                        `>> [BIT_ROT:QUARANTINE] Isolating corrupted key '${meta.key}' [ALERT]`,
                    )

                    // Re-read object to move into quarantine namespace
                    const corruptedItem = await this.bucket.get(meta.key)
                    if (corruptedItem) {
                        const targetKey = `${quarantinePrefix}/${scrubbedAtMs}/${meta.key}`
                        const payload = await corruptedItem.arrayBuffer()

                        await this.bucket.put(targetKey, payload, {
                            customMetadata: {
                                ...corruptedItem.customMetadata,
                                bit_rot_detected_at: String(scrubbedAtMs),
                                original_key: meta.key,
                                expected_sha256: expectedSha || 'NONE',
                                computed_sha256: verification.computedSha256,
                            },
                        })

                        // Purge original corrupted key to prevent poisoned reads
                        await this.bucket.delete(meta.key)
                        quarantinedKeys.push(meta.key)

                        console.log(
                            `>> [BIT_ROT:PURGED] Moved '${meta.key}' -> '${targetKey}' [OK]`,
                        )
                    }
                    break
                }
            }
        }

        const report: R2ScrubReport = {
            batchId,
            prefix,
            cursor,
            nextCursor: listResult.truncated ? listResult.cursor : undefined,
            isTruncated: listResult.truncated,
            totalScanned: objects.length,
            healthyCount,
            corruptedCount,
            missingMetadataCount,
            quarantinedKeys,
            scrubbedAtMs,
        }

        console.log(
            `>> [R2_SCRUB:COMPLETE] Batch '${batchId}' processed ${objects.length} objects (Healthy: ${healthyCount}, Bit-Rot: ${corruptedCount}) [OK]`,
        )
        return report
    }
}
