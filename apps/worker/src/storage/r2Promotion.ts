export interface ParsedStagingKey {
    taskId: string
    epoch: number
    sha256: string
    extension: string
}

export interface CanonicalManifestEntry {
    taskId: string
    epoch: number
    stagingKey: string
    canonicalKey: string
    sha256: string
    workerId: string
    promotedAtMs: number
    metadata?: Record<string, any>
}

const STAGING_KEY_REGEX =
    /^staging\/renders\/([a-zA-Z0-9_\-]+)\/epoch_(\d+)_([a-fA-F0-9]{32,64})\.([a-zA-Z0-9]+)$/

/**
 * Parses an epoch-scoped, content-addressed staging key.
 */
export function parseStagingKey(key: string): ParsedStagingKey {
    const match = STAGING_KEY_REGEX.exec(key)
    if (!match) {
        throw new Error(
            `INVALID_STAGING_KEY: Key '${key}' does not match staging format 'staging/renders/{taskId}/epoch_{epoch}_{sha256}.{ext}'.`,
        )
    }

    return {
        taskId: match[1],
        epoch: parseInt(match[2], 10),
        sha256: match[3].toLowerCase(),
        extension: match[4].toLowerCase(),
    }
}

/**
 * Validates that a staging key matches the expected taskId and active lease epoch.
 */
export function validateStagingKey(
    key: string,
    expectedTaskId: string,
    expectedEpoch: number,
): ParsedStagingKey {
    const parsed = parseStagingKey(key)

    if (parsed.taskId !== expectedTaskId) {
        throw new Error(
            `TASK_ID_MISMATCH: Staging key belongs to '${parsed.taskId}', expected '${expectedTaskId}'.`,
        )
    }

    if (parsed.epoch !== expectedEpoch) {
        throw new Error(
            `EPOCH_TOKEN_MISMATCH: Staging key stamped with Epoch ${parsed.epoch}, active lease is Epoch ${expectedEpoch}.`,
        )
    }

    return parsed
}

/**
 * Generates the canonical storage path for an approved render plate.
 */
export function buildCanonicalKey(
    taskId: string,
    sha256: string,
    extension: string,
): string {
    return `canonical/renders/${taskId}/${sha256}.${extension}`
}
