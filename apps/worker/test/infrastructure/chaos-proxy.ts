// 1. Import the Class (Runtime Value)
import { DurableObject } from 'cloudflare:workers'

// 2. Import the Type (Compiler Definition)
import type { DurableObjectStub } from '@cloudflare/workers-types'

export interface SuckOptions {
    /** Minimum latency in ms (default: 5ms) */
    minLatency?: number
    /** Maximum latency in ms (default: 20ms) */
    maxLatency?: number
    /** Probability of failure 0.0 - 1.0 (default: 0.02 / 2%) */
    failureRate?: number
    /** Name to use for logging since accessing target.id can fail in proxies */
    loggingName?: string
}

/**
 * WRAPPER OF DOOM
 *
 * We constrain T to extend 'DurableObject' (the Class).
 * We return DurableObjectStub<T> (the Type).
 */
export function createSuckStub<T extends DurableObject>(
    originalStub: DurableObjectStub<T>,
    options: SuckOptions = {},
): DurableObjectStub<T> {
    const min = options.minLatency ?? 5
    const max = options.maxLatency ?? 20
    const rate = options.failureRate ?? 0.02
    const name = options.loggingName ?? 'Unknown Object'

    // We cast the Proxy to 'any' internally to bypass the strict signature mismatch
    // between the Node.js 'fetch' and Cloudflare 'fetch', but we cast the result back
    // to DurableObjectStub<T> to keep the rest of the codebase strict.
    return new Proxy(originalStub, {
        get(target: any, prop) {
            if (prop === 'fetch') {
                return async (...args: any[]) => {
                    // 1. THE DICE ROLL (Packet Loss)
                    if (Math.random() < rate) {
                        console.warn(
                            `[The Suck] Simulating Network Failure for ${name}`,
                        )
                        throw new Error(
                            'NETWORK_ERROR: The Suck claimed this packet.',
                        )
                    }

                    // 2. THE LAG (Jitter)
                    const delay =
                        Math.floor(Math.random() * (max - min + 1)) + min
                    if (delay > 0) {
                        await new Promise((resolve) =>
                            setTimeout(resolve, delay),
                        )
                    }

                    // 3. PASS-THROUGH
                    // We bind the method to the original target to prevent 'Illegal invocation'
                    return target.fetch.apply(target, args)
                }
            }

            // FIX: Use 'target' as the receiver instead of 'receiver' (the proxy).
            // This prevents "TypeError: Illegal invocation" when accessing native properties
            // like 'id' or 'name' which rely on internal V8 slots.
            const value = Reflect.get(target, prop, target)

            if (typeof value === 'function') {
                return value.bind(target)
            }
            return value
        },
    }) as unknown as DurableObjectStub<T>
}
