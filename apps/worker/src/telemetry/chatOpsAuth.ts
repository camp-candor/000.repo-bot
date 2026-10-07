export interface ChatOpsAuthResult {
    valid: boolean
    error?: string
    skewSec?: number
}

export interface ChatOpsRequestAuthResult {
    authenticated: boolean
    rawBody?: string
    response?: Response
    error?: string
}

export const CHATOPS_MAX_DRIFT_SECONDS = 300
export const CHATOPS_SIGNATURE_PREFIX = 'v0='

/**
 * Converts a hexadecimal string into a Uint8Array byte buffer.
 */
export function hexToBytes(hex: string): Uint8Array {
    if (hex.length % 2 !== 0) {
        throw new Error('HEX_PARSE_ERROR: Invalid odd length hex string.')
    }
    const bytes = new Uint8Array(hex.length / 2)
    for (let i = 0; i < hex.length; i += 2) {
        const byteValue = parseInt(hex.substring(i, i + 2), 16)
        if (isNaN(byteValue)) {
            throw new Error(
                `HEX_PARSE_ERROR: Invalid hex character at byte ${i / 2}.`,
            )
        }
        bytes[i / 2] = byteValue
    }
    return bytes
}

/**
 * Converts a Uint8Array buffer into a lowercase hexadecimal string.
 */
export function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
}

/**
 * Constructs the canonical signature payload envelope.
 */
export function buildCanonicalEnvelope(
    timestampSec: number | string,
    rawBody: string,
): string {
    return `v0:${timestampSec}:${rawBody}`
}

/**
 * Generates an authentic HMAC-SHA256 signature string for testing and outbound webhook signing.
 */
export async function generateChatOpsSignature(
    rawBody: string,
    timestampSec: number,
    secret: string,
): Promise<string> {
    const canonicalPayload = buildCanonicalEnvelope(timestampSec, rawBody)
    const encoder = new TextEncoder()

    const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
    )

    const signatureBuffer = await crypto.subtle.sign(
        'HMAC',
        key,
        encoder.encode(canonicalPayload),
    )
    const signatureHex = bytesToHex(new Uint8Array(signatureBuffer))

    return `${CHATOPS_SIGNATURE_PREFIX}${signatureHex}`
}

/**
 * Verifies timing-safe HMAC-SHA256 signature using native Web Crypto API.
 */
export async function verifyChatOpsSignature(
    rawBody: string,
    signatureHeader: string | null,
    timestampHeader: string | null,
    secret: string,
    nowSec: number = Math.floor(Date.now() / 1000),
): Promise<ChatOpsAuthResult> {
    if (!signatureHeader || !timestampHeader) {
        return {
            valid: false,
            error: 'MISSING_AUTH_HEADERS: Both x-chatops-signature and x-chatops-timestamp are mandatory.',
        }
    }

    const timestampSec = parseInt(timestampHeader, 10)
    if (isNaN(timestampSec) || timestampSec <= 0) {
        return {
            valid: false,
            error: 'INVALID_TIMESTAMP_HEADER: Timestamp must be positive integer seconds.',
        }
    }

    // Bidirectional anti-replay skew gate: |now - req| <= 300 seconds
    const skewSec = Math.abs(nowSec - timestampSec)
    if (skewSec > CHATOPS_MAX_DRIFT_SECONDS) {
        console.warn(
            `>> [CHATOPS:AUTH:FAIL] Replay window expired: skew ${skewSec}s exceeds limit ${CHATOPS_MAX_DRIFT_SECONDS}s [REJECT]`,
        )
        return {
            valid: false,
            skewSec,
            error: `TIMESTAMP_DRIFT_EXPIRED: Request skew (${skewSec}s) exceeds ${CHATOPS_MAX_DRIFT_SECONDS}s limit.`,
        }
    }

    if (!signatureHeader.startsWith(CHATOPS_SIGNATURE_PREFIX)) {
        return {
            valid: false,
            skewSec,
            error: `INVALID_SIGNATURE_FORMAT: Signature must start with prefix '${CHATOPS_SIGNATURE_PREFIX}'.`,
        }
    }

    const signatureHex = signatureHeader.substring(
        CHATOPS_SIGNATURE_PREFIX.length,
    )
    if (signatureHex.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(signatureHex)) {
        return {
            valid: false,
            skewSec,
            error: 'INVALID_SIGNATURE_FORMAT: Signature digest must be exactly 64 hexadecimal characters.',
        }
    }

    let expectedSigBytes: Uint8Array
    try {
        expectedSigBytes = hexToBytes(signatureHex)
    } catch (err: any) {
        return {
            valid: false,
            skewSec,
            error: `HEX_DECODE_FAILED: ${err.message}`,
        }
    }

    const canonicalPayload = buildCanonicalEnvelope(timestampHeader, rawBody)
    const encoder = new TextEncoder()
    const payloadBytes = encoder.encode(canonicalPayload)
    const secretBytes = encoder.encode(secret)

    try {
        const key = await crypto.subtle.importKey(
            'raw',
            secretBytes,
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['verify'],
        )

        // Constant-time hardware/isolate signature verification
        const isAuthentic = await crypto.subtle.verify(
            'HMAC',
            key,
            expectedSigBytes as unknown as BufferSource,
            payloadBytes,
        )

        if (!isAuthentic) {
            console.warn(
                '>> [CHATOPS:AUTH:FAIL] HMAC verification failed: SIGNATURE_MISMATCH [REJECT]',
            )
            return {
                valid: false,
                skewSec,
                error: 'SIGNATURE_MISMATCH',
            }
        }

        console.log(
            `>> [CHATOPS:AUTH:OK] Verified HMAC-SHA256 signature (Skew: ${skewSec}s) [OK]`,
        )
        return { valid: true, skewSec }
    } catch (err: any) {
        console.error(
            `>> [CHATOPS:AUTH:ERR] Web Crypto execution exception: ${err.message} [FAIL]`,
        )
        return {
            valid: false,
            skewSec,
            error: `CRYPTO_VERIFY_EXCEPTION: ${err.message}`,
        }
    }
}

/**
 * Headless Ingress Request Authenticator Middleware.
 */
export async function authenticateChatOpsRequest(
    request: Request,
    secret: string,
    nowSec?: number,
): Promise<ChatOpsRequestAuthResult> {
    const signatureHeader = request.headers.get('x-chatops-signature')
    const timestampHeader = request.headers.get('x-chatops-timestamp')

    let rawBody = ''
    try {
        rawBody = await request.text()
    } catch (err: any) {
        return {
            authenticated: false,
            error: 'BODY_READ_FAILED',
            response: new Response(
                JSON.stringify({
                    error: 'BODY_READ_FAILED',
                    message: err.message,
                }),
                {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' },
                },
            ),
        }
    }

    const result = await verifyChatOpsSignature(
        rawBody,
        signatureHeader,
        timestampHeader,
        secret,
        nowSec,
    )

    if (!result.valid) {
        return {
            authenticated: false,
            error: result.error,
            response: new Response(
                JSON.stringify({
                    error: 'UNAUTHORIZED',
                    diagnostic: result.error,
                }),
                {
                    status: 401,
                    headers: { 'Content-Type': 'application/json' },
                },
            ),
        }
    }

    return {
        authenticated: true,
        rawBody,
    }
}
