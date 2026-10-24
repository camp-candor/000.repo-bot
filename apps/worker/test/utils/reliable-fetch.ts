/**
 * RELIABLE FETCH
 *
 * NUCLEAR OPTION V2: IRONCLAD PATIENCE
 * We increase retries significantly to handle the slow "Invalidation" cycles
 * in GitHub Actions CI.
 */
export async function reliableFetch(
    stub: any,
    input: any,
    init?: any,
): Promise<any> {
    // FIX: 20 Retries allows for ~20 seconds of instability.
    const maxRetries = init?.retries ?? 20
    const backoffBase = init?.backoffBase ?? 50
    const maxDelay = 1000 // Cap delay at 1 second per retry

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            // Try the fetch
            return await stub.fetch(input, init)
        } catch (err: any) {
            const msg = err.message || ''

            // Catch specific Cloudflare runner instability errors
            const isNetworkError =
                msg.includes('NETWORK_ERROR') ||
                msg.includes('connection') ||
                msg.includes('reset') ||
                msg.includes('invalidating') || // The "index.ts changed" error
                msg.includes('ejected')

            // If it's a real logic error (not network), or we are out of tries, throw.
            if (attempt === maxRetries || !isNetworkError) {
                throw err
            }

            // Calculate Delay with Jitter and Cap
            // Exponential backoff up to 1 second, then constant.
            let delay = backoffBase * Math.pow(1.3, attempt)
            if (delay > maxDelay) delay = maxDelay

            // Add a little randomness to prevent synchronized retries
            delay = delay + Math.random() * 100

            console.warn(
                `[ReliableFetch] Packet dropped (${msg}). Retrying (${attempt + 1}/${maxRetries}) in ${Math.round(delay)}ms...`,
            )

            await new Promise((resolve) => setTimeout(resolve, delay))
        }
    }

    throw new Error(
        'ReliableFetch failed to establish connection after max retries.',
    )
}
