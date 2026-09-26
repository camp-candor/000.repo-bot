export interface WatchedRepo {
    id: string // e.g. "camp-candor/000.repo-bot"
    owner: string
    repo: string
    url: string
}

export interface ParsedAskJulesInput {
    rawPath: string
    prompt: string
}

/**
 * Parses raw text input split by the first colon into path and task prompt,
 * decoding Slack HTML entities in the raw path.
 */
export function parseAskJulesMessage(text: string): ParsedAskJulesInput | null {
    if (!text) return null

    // If there's an explicit space-colon-space, prefer that delimiter
    const explicitColon = text.indexOf(' : ')
    let colonIndex = -1

    if (explicitColon !== -1) {
        colonIndex = explicitColon + 1
    } else {
        // Find the first colon that isn't part of a Windows drive letter
        const match = text.match(/(?:^|[^a-zA-Z])([a-zA-Z]:[\\\/])/)
        if (match) {
            const firstColon = text.indexOf(':')
            colonIndex = text.indexOf(':', firstColon + 1)
        } else {
            colonIndex = text.indexOf(':')
        }
    }

    if (colonIndex === -1) return null

    const rawPath = text.substring(0, colonIndex).trim()
    const prompt = text.substring(colonIndex + 1).trim()

    if (!rawPath || !prompt) return null
    return { rawPath, prompt }
}

/**
 * Resolves polymorphic shell prompts, filesystem paths, and URLs against watched fleet repos,
 * handling Slack HTML entity escaping (&gt;, &lt;, &amp;).
 */
export function resolveFleetRepo(
    rawInput: string,
    fleet: WatchedRepo[],
): WatchedRepo | null {
    if (!rawInput || fleet.length === 0) return null

    // 1. Decode Slack HTML entities
    let cleaned = rawInput
        .replace(/&gt;/gi, '>')
        .replace(/&lt;/gi, '<')
        .replace(/&amp;/gi, '&')
        .trim()

    // 2. Strip PowerShell tokens, terminal prompt symbols, brackets, and quotes
    cleaned = cleaned
        .replace(/^PS\s+/i, '')
        .replace(/[>"'`#$]/g, '')
        .trim()

    // 3. Normalize Windows backslashes to forward slashes
    cleaned = cleaned.replace(/\\+/g, '/')

    // 4. Strip trailing monorepo workspace subpaths
    cleaned = cleaned
        .replace(/\/apps(\/.*)?$/i, '')
        .replace(/\/packages(\/.*)?$/i, '')
        .replace(/\/src(\/.*)?$/i, '')
        .replace(/\/dist(\/.*)?$/i, '')
        .replace(/\/+$/, '')

    const lowerCleaned = cleaned.toLowerCase()

    // 5. Exact match against repository ID, URL, or URL suffix
    for (const item of fleet) {
        const itemId = item.id.toLowerCase()
        const itemUrl = item.url.toLowerCase()

        if (
            lowerCleaned === itemId ||
            lowerCleaned === itemUrl ||
            lowerCleaned.endsWith(`/${itemId}`) ||
            lowerCleaned.endsWith(itemId)
        ) {
            return item
        }
    }

    // 6. Segment match: sanitize non-alphanumeric punctuation and check repo name
    const segments = lowerCleaned
        .split('/')
        .map((s) => s.replace(/[^a-z0-9._-]/g, ''))

    for (const item of fleet) {
        const repoName = item.repo.toLowerCase()
        if (segments.includes(repoName)) {
            return item
        }
    }

    return null
}
