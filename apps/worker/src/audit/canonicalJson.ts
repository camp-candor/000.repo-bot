/**
 * Canonical JSON Serializer (RFC 8785 subset)
 * Deterministically sorts object keys and normalizes values for hashing.
 */
export function canonicalizeJson(obj: any): string {
    if (obj === null || typeof obj !== 'object') {
        return JSON.stringify(obj)
    }
    if (Array.isArray(obj)) {
        return '[' + obj.map(canonicalizeJson).join(',') + ']'
    }
    const sortedKeys = Object.keys(obj).sort()
    const parts = sortedKeys.map(
        (key) => `${JSON.stringify(key)}:${canonicalizeJson(obj[key])}`,
    )
    return '{' + parts.join(',') + '}'
}
