export interface EscalationVerificationResult {
    valid: boolean
    error?: string
}

export const MAX_DRIFT_WINDOW_MS = 300_000 // 5 minutes anti-replay window

/**
 * Converts a hex string into a Uint8Array byte buffer.
 */
function hexToBytes(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2)
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
    }
    return bytes
}

/**
 * Computes timing-safe HMAC-SHA256 signature verification using Web Crypto API.
 */
export async function verifyEscalationSignature(
    rawBody: string,
    signatureHeader: string,
    timestampHeader: string,
    secret: string,
): Promise<EscalationVerificationResult> {
    const timestampSec = parseInt(timestampHeader, 10)
    if (isNaN(timestampSec)) {
        return { valid: false, error: 'INVALID_TIMESTAMP_HEADER' }
    }

    const nowSec = Math.floor(Date.now() / 1000)
    const skewSec = Math.abs(nowSec - timestampSec)

    // Anti-replay attack timing window: 300 seconds (5 minutes)
    if (skewSec > MAX_DRIFT_WINDOW_MS / 1000) {
        return {
            valid: false,
            error: `TIMESTAMP_DRIFT_EXPIRED: Skew is ${skewSec}s (limit 300s)`,
        }
    }

    // Expected format: v0=a8f5b3...
    const prefix = 'v0='
    if (!signatureHeader.startsWith(prefix)) {
        return { valid: false, error: 'INVALID_SIGNATURE_FORMAT' }
    }
    const signatureHex = signatureHeader.substring(prefix.length)

    // Message payload to sign: v0:<timestamp>:<rawBody>
    const signaturePayload = `v0:${timestampHeader}:${rawBody}`
    const encoder = new TextEncoder()
    const dataBytes = encoder.encode(signaturePayload)
    const secretBytes = encoder.encode(secret)

    try {
        const key = await crypto.subtle.importKey(
            'raw',
            secretBytes,
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['verify', 'sign'],
        )

        const expectedSigBytes = hexToBytes(signatureHex)
        const isValid = await crypto.subtle.verify(
            'HMAC',
            key,
            expectedSigBytes as any,
            dataBytes,
        )

        if (!isValid) {
            return { valid: false, error: 'SIGNATURE_MISMATCH' }
        }

        return { valid: true }
    } catch (err: any) {
        return {
            valid: false,
            error: `HMAC_VERIFICATION_EXCEPTION: ${err.message}`,
        }
    }
}

/**
 * Generates an HMAC-SHA256 signature header for test verification or outbound calls.
 */
export async function generateEscalationSignature(
    rawBody: string,
    timestampSec: number,
    secret: string,
): Promise<string> {
    const signaturePayload = `v0:${timestampSec}:${rawBody}`
    const encoder = new TextEncoder()
    const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
    )

    const sigBuffer = await crypto.subtle.sign(
        'HMAC',
        key,
        encoder.encode(signaturePayload),
    )
    const sigHex = Array.from(new Uint8Array(sigBuffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')

    return `v0=${sigHex}`
}

/**
 * 7-Bit ASCII Notification Formatters
 */
export function formatPromotionEscalation(
    taskId: string,
    epoch: number,
    canonicalKey: string,
    sha256: string,
): string {
    return [
        '```text',
        '================================================================================',
        '>> [TELEMETRY:ESCALATION] CANONICAL PROMOTION COMMITTED',
        '================================================================================',
        `TASK ID:       ${taskId}`,
        `LEASE EPOCH:   ${epoch}`,
        `CANONICAL KEY: ${canonicalKey}`,
        `SHA-256:       ${sha256}`,
        'STATUS:        COMMITTED TO CANONICAL MANIFEST [OK]',
        '================================================================================',
        '```',
    ].join('\n')
}

export function formatWatchdogEscalation(
    taskId: string,
    attempt: number,
    maxAttempts: number,
    epoch: number,
): string {
    return [
        '```text',
        '================================================================================',
        '>> [TELEMETRY:ESCALATION] WATCHDOG LEASE EXPIRED - RETRY ENGAGED',
        '================================================================================',
        `TASK ID:       ${taskId}`,
        `ATTEMPT:       ${attempt}/${maxAttempts}`,
        `NEW EPOCH:     ${epoch}`,
        'ACTION:        ZOMBIE LEASE REVOKED :: TASK RE-QUEUED [RETRY]',
        '================================================================================',
        '```',
    ].join('\n')
}

export function formatDlqEscalation(
    taskId: string,
    attemptCount: number,
    errorSummary: string,
): string {
    return [
        '```text',
        '================================================================================',
        '>> [TELEMETRY:ESCALATION] CIRCUIT BREAKER TRIPPED - TASK QUARANTINED TO DLQ',
        '================================================================================',
        `TASK ID:       ${taskId}`,
        `TOTAL ATTEMPTS:${attemptCount}`,
        `DIAGNOSTIC:    ${errorSummary}`,
        'ACTION:        EXECUTION FROZEN :: HANDOFF TO STORY ARCHITECT [HALT]',
        '================================================================================',
        '```',
    ].join('\n')
}

export function formatLedgerAuditEscalation(
    taskId: string,
    blockCount: number,
    latestHash: string,
): string {
    return [
        '```text',
        '================================================================================',
        '>> [TELEMETRY:AUDIT] CRYPTOGRAPHIC LEDGER AUDIT VERIFIED',
        '================================================================================',
        `TASK ID:       ${taskId}`,
        `BLOCKS TOTAL:  ${blockCount}`,
        `LATEST HASH:   ${latestHash}`,
        'INTEGRITY:     UNBROKEN ZERO-TAMPER HASH-CHAIN [OK]',
        '================================================================================',
        '```',
    ].join('\n')
}

export class TelemetryEscalationGateway {
    /**
     * Dispatches pure 7-bit ASCII notifications to configured webhook targets.
     */
    public async dispatchAlert(
        webhookUrl: string,
        formattedMessage: string,
    ): Promise<{ success: boolean; status: number }> {
        try {
            const response = await fetch(webhookUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': '000.repo-bot-telemetry',
                },
                body: JSON.stringify({
                    text: formattedMessage,
                }),
            })

            console.log(
                `>> [TELEMETRY:DISPATCH] Escalation alert sent to ${webhookUrl} (Status: ${response.status}) [OK]`,
            )
            return { success: response.ok, status: response.status }
        } catch (err: any) {
            console.error(
                `>> [TELEMETRY:ERR] Webhook transmission failed: ${err.message} [FAIL]`,
            )
            return { success: false, status: 0 }
        }
    }
}
