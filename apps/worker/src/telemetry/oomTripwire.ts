export const ISOLATE_MEMORY_CEILING_BYTES = 128 * 1024 * 1024 // 128 MB V8 Isolate Limit
export const DEFAULT_OOM_TRIPWIRE_THRESHOLD_BYTES = 96 * 1024 * 1024 // 96 MB Headroom Tripwire
export const MAX_SINGLE_PAYLOAD_BYTES = 32 * 1024 * 1024 // 32 MB Maximum Single Object

export interface MemoryTripwireOptions {
    ceilingBytes?: number
    tripwireThresholdBytes?: number
    maxSinglePayloadBytes?: number
    onTripwireExceeded?: (allocatedBytes: number, limitBytes: number) => void
}

export interface MemoryTripwire {
    getAllocatedBytes(): number
    reserve(bytesOrObj: number | unknown): void
    release(bytes: number): void
    reset(): void
}

/**
 * Traverses values and calculates estimated memory consumption in bytes.
 * Safely guards against circular structures via a WeakSet tracker.
 */
export function estimateObjectSizeBytes(
    val: unknown,
    seen: WeakSet<object> = new WeakSet(),
): number {
    if (val === null || val === undefined) {
        return 0
    }

    if (typeof val === 'boolean') {
        return 4
    }

    if (typeof val === 'number') {
        return 8
    }

    if (typeof val === 'bigint') {
        return 16
    }

    if (typeof val === 'string') {
        return val.length * 2 // UTF-16 in V8: 2 bytes per char
    }

    if (typeof val === 'symbol') {
        return 32
    }

    if (typeof val === 'object') {
        if (seen.has(val)) {
            return 0 // Prevent infinite cycle recursion
        }
        seen.add(val)

        if (val instanceof ArrayBuffer) {
            return val.byteLength
        }

        if (ArrayBuffer.isView(val)) {
            return val.byteLength
        }

        let bytes = 32 // Base object pointer overhead

        if (Array.isArray(val)) {
            for (let i = 0; i < val.length; i++) {
                bytes += 8 + estimateObjectSizeBytes(val[i], seen)
            }
            return bytes
        }

        const record = val as Record<string, unknown>
        for (const key of Object.keys(record)) {
            bytes += key.length * 2 + 8 // Key string plus property descriptor
            bytes += estimateObjectSizeBytes(record[key], seen)
        }

        return bytes
    }

    return 16
}

/**
 * Constructs a fail-closed memory allocation tripwire to protect worker isolates from OOM crashes.
 */
export function createMemoryTripwire(
    options: MemoryTripwireOptions = {},
): MemoryTripwire {
    const ceilingBytes = options.ceilingBytes ?? ISOLATE_MEMORY_CEILING_BYTES
    const thresholdBytes = Math.min(
        options.tripwireThresholdBytes ?? DEFAULT_OOM_TRIPWIRE_THRESHOLD_BYTES,
        ceilingBytes,
    )
    const maxSingleBytes =
        options.maxSinglePayloadBytes ?? MAX_SINGLE_PAYLOAD_BYTES
    let allocatedBytes = 0

    return {
        getAllocatedBytes(): number {
            return allocatedBytes
        },

        reserve(bytesOrObj: number | unknown): void {
            const bytesToReserve =
                typeof bytesOrObj === 'number'
                    ? bytesOrObj
                    : estimateObjectSizeBytes(bytesOrObj)

            if (!Number.isFinite(bytesToReserve) || bytesToReserve < 0) {
                throw new Error(
                    `ISOLATE_MEMORY_BUDGET_EXCEEDED: INVALID_RESERVATION: ${String(bytesToReserve)}`,
                )
            }

            if (bytesToReserve > maxSingleBytes) {
                const errorMsg = `SINGLE_PAYLOAD_EXCEEDS_CEILING: Payload size (${bytesToReserve} bytes) exceeds maximum single payload limit (${maxSingleBytes} bytes).`
                console.error(`>> [OOM:SINGLE_REJECT] ${errorMsg} [FAIL]`)
                throw new Error(`ISOLATE_MEMORY_BUDGET_EXCEEDED: ${errorMsg}`)
            }

            if (allocatedBytes + bytesToReserve > thresholdBytes) {
                const total = allocatedBytes + bytesToReserve
                const errorMsg = `TRIPWIRE_LIMIT_BREACHED: Allocation of ${bytesToReserve} bytes would push total memory to ${total} bytes (Threshold: ${thresholdBytes} bytes).`
                console.error(
                    `>> [OOM:TRIPWIRE] Budget exceeded: ${total} / ${thresholdBytes} bytes [HALT] :: ${errorMsg}`,
                )

                if (options.onTripwireExceeded) {
                    try {
                        options.onTripwireExceeded(total, thresholdBytes)
                    } catch (cbErr: unknown) {
                        const msg =
                            cbErr instanceof Error
                                ? cbErr.message
                                : String(cbErr)
                        console.error(
                            `>> [OOM:HOOK_ERROR] Alert hook failed: ${msg}`,
                        )
                    }
                }

                throw new Error(`ISOLATE_MEMORY_BUDGET_EXCEEDED: ${errorMsg}`)
            }

            allocatedBytes += bytesToReserve
        },

        release(bytes: number): void {
            allocatedBytes = Math.max(0, allocatedBytes - Math.max(0, bytes))
        },

        reset(): void {
            allocatedBytes = 0
        },
    }
}
