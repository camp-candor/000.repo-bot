const REDACTION_PATTERNS: Array<[RegExp, string]> = [
    [/ghp_[a-zA-Z0-9]{36,}/g, '[REDACTED_GH_TOKEN]'],
    [/github_pat_[a-zA-Z0-9_]{82}/g, '[REDACTED_GH_PAT]'],
    [
        /xox[baprs]-[0-9]{10,13}-[0-9]{10,13}-[a-zA-Z0-9]{24,32}/g,
        '[REDACTED_SLACK_TOKEN]',
    ],
    [
        /-----BEGIN [A-Z ]+ PRIVATE KEY-----[^-]+-----END [A-Z ]+ PRIVATE KEY-----/gs,
        '[REDACTED_PRIVATE_KEY]',
    ],
    [/Bearer\s+[a-zA-Z0-9\-_.]+/gi, 'Bearer [REDACTED_AUTH_TOKEN]'],
    [
        /(["']?(?:secret|token|password|apiKey|authorization)["']?\s*:\s*["'])(?!\[REDACTED_)([^"']+)(["'])/gi,
        '$1[REDACTED_FIELD]$3',
    ],
]

/**
 * Synchronously removes sensitive tokens and credentials from payload strings.
 */
export function redactSensitiveData(raw: string): string {
    let clean = raw
    for (const [regex, replacement] of REDACTION_PATTERNS) {
        clean = clean.replace(regex, replacement)
    }
    return clean
}
