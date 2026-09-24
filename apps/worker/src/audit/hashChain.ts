import { canonicalizeJson } from './canonicalJson.js'
import { redactSensitiveData } from './redaction.js'

/**
 * Computes SHA-256 hex digest via Web Crypto API.
 */
export async function sha256Hex(data: string): Promise<string> {
    const encoder = new TextEncoder()
    const bytes = encoder.encode(data)
    const digest = await crypto.subtle.digest('SHA-256', bytes)
    return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
}

/**
 * Computes the deterministic Genesis Hash H0 for a repository.
 */
export async function computeGenesisHash(repository: string): Promise<string> {
    const cleanRepo = repository.toLowerCase().trim()
    return sha256Hex(`REPO-BOT-GENESIS::${cleanRepo}`)
}

/**
 * Computes record digest Hn = SHA-256(Hn-1 || CanonicalJCS(En)).
 */
export async function computeRecordHash(
    prevHash: string,
    eventData: {
        sequenceId: number
        taskId: string
        repository: string
        eventType: string
        actorId: string
        headSha: string
        payload: any
        createdAt: number
    },
): Promise<{ recordHash: string; canonicalPayload: string }> {
    const redactedPayloadStr = redactSensitiveData(
        JSON.stringify(eventData.payload),
    )
    const cleanPayload = JSON.parse(redactedPayloadStr)

    const canonicalBody = canonicalizeJson({
        seq: eventData.sequenceId,
        task: eventData.taskId,
        repo: eventData.repository,
        type: eventData.eventType,
        actor: eventData.actorId,
        headSha: eventData.headSha,
        payload: cleanPayload,
        ts: eventData.createdAt,
    })

    const recordHash = await sha256Hex(`${prevHash}${canonicalBody}`)
    return { recordHash, canonicalPayload: canonicalBody }
}
