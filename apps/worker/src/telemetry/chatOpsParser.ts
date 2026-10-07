export interface ChatOpsCommand {
    action: 'OVERRIDE' | 'RETRY' | 'ABORT' | 'STATUS' | 'FLEET'
    taskId?: string
    operatorId: string
    positivePrompt?: string
    negativePrompt?: string
    seed?: number
    denoiseStrength?: number
    reason?: string
}

/**
 * Parses conversational slash-command strings into typed ChatOpsCommand structures.
 * Supports complex regex parameter extraction with quoted string handling.
 */
export function parseSlashCommand(
    rawText: string,
    operatorId: string,
): ChatOpsCommand {
    if (!operatorId || operatorId.trim() === '') {
        throw new Error(
            'COMMAND_PARSE_ERROR: Operator identity (operatorId) is mandatory for non-repudiation.',
        )
    }

    const trimmed = rawText.trim()
    // Split by whitespace just to isolate the leading positional arguments
    // We will parse flags from the raw remainder string to preserve quotes
    const tokens = trimmed.split(/\s+/)

    if (tokens.length === 0 || tokens[0] === '') {
        throw new Error('COMMAND_PARSE_ERROR: Empty command payload.')
    }

    // Strip optional bot prefix
    if (tokens[0] === '/repo-bot') {
        tokens.shift()
    }

    const actionToken = (tokens[0] || '').toUpperCase()
    tokens.shift()

    if (actionToken === 'FLEET') {
        return { action: 'FLEET', operatorId }
    }

    const taskId = tokens[0] || ''
    if (!taskId || taskId.startsWith('--')) {
        throw new Error(
            `COMMAND_PARSE_ERROR: Missing mandatory taskId for action '${actionToken}'.`,
        )
    }

    if (actionToken === 'STATUS') {
        return { action: 'STATUS', taskId, operatorId }
    }

    // Isolate remainder string to run robust regex flag extraction
    // Remainder string starts after the taskId
    const remainderRegex = new RegExp(`^.*?${taskId}\\s+(.*)$`, 'i')
    const match = trimmed.match(remainderRegex)
    const remainder = match ? match[1] : ''

    // Regex Explanation:
    // --([a-zA-Z0-9_-]+)  -> Match double dash and capture flag name
    // \s+                 -> Match whitespace separator
    // ("(?:\\"|[^"])*"|\S+) -> Capture either a quoted string (handling escaped quotes) OR a non-whitespace string
    const flagMatches = remainder.matchAll(
        /--([a-zA-Z0-9_-]+)\s+("(?:\\"|[^"])*"|\S+)/g,
    )
    const flags: Record<string, string> = {}

    for (const flagMatch of flagMatches) {
        const key = flagMatch[1].toLowerCase()
        let val = flagMatch[2]

        // Unescape quoted strings cleanly
        if (val.startsWith('"') && val.endsWith('"') && val.length >= 2) {
            val = val.substring(1, val.length - 1).replace(/\\"/g, '"')
        }
        flags[key] = val
    }

    switch (actionToken) {
        case 'OVERRIDE':
            return {
                action: 'OVERRIDE',
                taskId,
                operatorId,
                positivePrompt: flags.prompt || flags.positive,
                negativePrompt: flags.negative,
                seed: flags.seed ? parseInt(flags.seed, 10) : undefined,
                denoiseStrength: flags.denoise
                    ? parseFloat(flags.denoise)
                    : undefined,
                reason: flags.reason,
            }

        case 'RETRY':
            return {
                action: 'RETRY',
                taskId,
                operatorId,
                reason: flags.reason,
            }

        case 'ABORT':
            return {
                action: 'ABORT',
                taskId,
                operatorId,
                reason: flags.reason,
            }

        default:
            throw new Error(
                `COMMAND_PARSE_ERROR: Unknown action '${actionToken}'. Expected OVERRIDE, RETRY, ABORT, STATUS, or FLEET.`,
            )
    }
}
