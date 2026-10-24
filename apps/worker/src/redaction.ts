// apps/worker/src/redaction.ts

/**
 * ============================================================================
 * :: SYNCHRONOUS IN-FLIGHT SECRET REDACTION FIREWALL
 * ============================================================================
 * Scrubs elevated bearer tokens, GitHub credentials, private keys, and
 * sensitive JSON fields from strings and structured objects before they reach
 * logs, terminal frames, LLM context, or persistent storage ledgers.
 */

const REDACTION_PATTERNS: Array<[RegExp, string]> = [
    [/ghp_[a-zA-Z0-9]{36,255}/g, '[REDACTED_GH_TOKEN]'],
    [/github_pat_[a-zA-Z0-9_]{82}/g, '[REDACTED_GH_PAT]'],
    [/cfut_[a-zA-Z0-9_-]{32,255}/g, '[REDACTED_CF_GATEWAY_TOKEN]'],
    [/xox[baprs]-[0-9a-zA-Z-]{10,64}/g, '[REDACTED_SLACK_TOKEN]'],
    [
        /-----BEGIN [A-Z ]+PRIVATE KEY[\s\S]+?-----END [A-Z ]+PRIVATE KEY-----/g,
        '[REDACTED_PRIVATE_KEY]',
    ],
    [/Bearer\s+[a-zA-Z0-9_\-\.]{20,}/gi, 'Bearer [REDACTED_AUTH_TOKEN]'],
    [
        /(["']?(?:secret|token|password|apiKey|authorization|auth)["']?\s*:\s*["'])([^"']+)(["'])/gi,
        '$1[REDACTED_FIELD]$3',
    ],
]

/**
 * Synchronously redacts known sensitive credential patterns from a string.
 */
export function redactSecrets(input: string): string {
    if (!input || typeof input !== 'string') {
        return input
    }

    let clean = input
    for (const [pattern, replacement] of REDACTION_PATTERNS) {
        clean = clean.replace(pattern, replacement)
    }
    return clean
}

/**
 * Canonical alias for redactSecrets adhering to audit ledger specifications.
 */
export const redactSensitiveData = redactSecrets

/**
 * Recursively redacts sensitive strings and keys within nested objects and arrays.
 */
export function redactObject<T>(input: T): T {
    if (typeof input === 'string') {
        return redactSecrets(input) as unknown as T
    }

    if (input === null || typeof input !== 'object') {
        return input
    }

    if (Array.isArray(input)) {
        return input.map((item) => redactObject(item)) as unknown as T
    }

    const cleanObj: Record<string, any> = {}
    for (const [key, value] of Object.entries(input as Record<string, any>)) {
        if (
            /^(?:secret|token|password|apiKey|authorization|auth)$/i.test(key)
        ) {
            if (
                typeof value === 'object' &&
                value !== null &&
                !Array.isArray(value)
            ) {
                cleanObj[key] = redactObject(value)
            } else {
                cleanObj[key] = '[REDACTED_FIELD]'
            }
        } else {
            cleanObj[key] = redactObject(value)
        }
    }

    return cleanObj as T
}
