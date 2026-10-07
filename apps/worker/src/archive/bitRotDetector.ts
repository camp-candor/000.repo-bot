import { createHash } from 'node:crypto'

export type ChecksumStatus =
    'HEALTHY' | 'BIT_ROT_DETECTED' | 'MISSING_EXPECTED_HASH' | 'STREAM_ERROR'

export interface BitRotVerificationResult {
    key: string
    expectedSha256?: string
    computedSha256: string
    status: ChecksumStatus
    bytesProcessed: number
    durationMs: number
    verifiedAtMs: number
    error?: string
}

/**
 * Computes SHA-256 digest over a Web ReadableStream chunk-by-chunk without RAM buffer bloat.
 */
export async function computeStreamSha256(
    stream: ReadableStream<Uint8Array>,
): Promise<{ sha256: string; totalBytes: number }> {
    const hasher = createHash('sha256')
    const reader = stream.getReader()
    let totalBytes = 0

    try {
        while (true) {
            const { done, value } = await reader.read()
            if (done) break
            if (value && value.length > 0) {
                hasher.update(value)
                totalBytes += value.length
            }
        }
    } finally {
        reader.releaseLock()
    }

    const sha256 = hasher.digest('hex')
    return { sha256, totalBytes }
}

/**
 * Verifies streamed R2 object bytes against the recorded canonical SHA-256 hash.
 */
export async function verifyR2ObjectChecksum(
    key: string,
    bodyStream: ReadableStream<Uint8Array>,
    expectedSha256?: string,
): Promise<BitRotVerificationResult> {
    const startTime = Date.now()
    const verifiedAtMs = Date.now()

    try {
        const { sha256: computedSha256, totalBytes } =
            await computeStreamSha256(bodyStream)
        const durationMs = Math.max(1, Date.now() - startTime)

        if (!expectedSha256) {
            console.warn(
                `>> [CHECKSUM:WARN] Object '${key}' missing canonical SHA-256 metadata [WARN]`,
            )
            return {
                key,
                computedSha256,
                status: 'MISSING_EXPECTED_HASH',
                bytesProcessed: totalBytes,
                durationMs,
                verifiedAtMs,
            }
        }

        const normalizedExpected = expectedSha256.trim().toLowerCase()
        const normalizedComputed = computedSha256.trim().toLowerCase()

        if (normalizedExpected !== normalizedComputed) {
            console.error(
                `>> [BIT_ROT:FAIL] Checksum mismatch on '${key}'. Expected ${normalizedExpected}, got ${normalizedComputed} [FAIL]`,
            )
            return {
                key,
                expectedSha256: normalizedExpected,
                computedSha256: normalizedComputed,
                status: 'BIT_ROT_DETECTED',
                bytesProcessed: totalBytes,
                durationMs,
                verifiedAtMs,
                error: `BIT_ROT_CHECKSUM_MISMATCH: Computed ${normalizedComputed} does not match canonical ${normalizedExpected}`,
            }
        }

        console.log(
            `>> [CHECKSUM:OK] Verified '${key}' (${totalBytes} bytes, ${durationMs}ms) [OK]`,
        )
        return {
            key,
            expectedSha256: normalizedExpected,
            computedSha256: normalizedComputed,
            status: 'HEALTHY',
            bytesProcessed: totalBytes,
            durationMs,
            verifiedAtMs,
        }
    } catch (err: any) {
        const durationMs = Math.max(1, Date.now() - startTime)
        console.error(
            `>> [CHECKSUM:ERR] Streaming read failed on '${key}': ${err.message} [FAIL]`,
        )
        return {
            key,
            expectedSha256,
            computedSha256: '',
            status: 'STREAM_ERROR',
            bytesProcessed: 0,
            durationMs,
            verifiedAtMs,
            error: `STREAM_READ_FAILURE: ${err.message}`,
        }
    }
}
