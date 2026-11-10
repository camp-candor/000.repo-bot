/**
 * apps/worker/src/security/webhookSignature.ts
 *
 * Edge-native constant-time HMAC-SHA256 signature verification engine.
 * Relies strictly on native Web Crypto (crypto.subtle) without Node.js dependencies.
 * Pure 7-bit clean ASCII compliance.
 */

export interface SignatureVerificationResult {
  readonly valid: boolean
  readonly reason?: string
  readonly latencyMs?: number
}

/**
 * Imports a raw webhook secret string into a Web Crypto HMAC CryptoKey.
 */
export async function importWebhookSecret(secret: string): Promise<CryptoKey> {
  const encoder = new TextEncoder()
  const keyBytes = encoder.encode(secret)

  return await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify', 'sign']
  )
}

/**
 * Parses the GitHub X-Hub-Signature-256 header and extracts the raw hex digest.
 */
export function parseSignatureHeader(signatureHeader: string | null | undefined): {
  readonly valid: boolean
  readonly hexDigest?: string
  readonly error?: string
} {
  if (!signatureHeader || typeof signatureHeader !== 'string') {
    return { valid: false, error: 'MISSING_SIGNATURE_HEADER' }
  }

  const trimmed = signatureHeader.trim()
  if (!trimmed.startsWith('sha256=')) {
    return { valid: false, error: 'MALFORMED_SIGNATURE_PREFIX' }
  }

  const hexDigest = trimmed.slice(7).trim()
  if (hexDigest.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(hexDigest)) {
    return { valid: false, error: 'INVALID_DIGEST_LENGTH' }
  }

  return { valid: true, hexDigest }
}

/**
 * Converts a 64-character hexadecimal string into a 32-byte Uint8Array.
 */
export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(32)
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

/**
 * Verifies the inbound raw payload against the X-Hub-Signature-256 header.
 * Executes constant-time comparison via native crypto.subtle.verify.
 */
export async function verifyWebhookSignature(
  rawPayload: Uint8Array | ArrayBuffer | string,
  signatureHeader: string | null | undefined,
  secret: string
): Promise<SignatureVerificationResult> {
  const startMs = Date.now()

  if (!secret) {
    return {
      valid: false,
      reason: 'MISSING_WEBHOOK_SECRET_CONFIGURATION',
      latencyMs: Date.now() - startMs,
    }
  }

  const headerParse = parseSignatureHeader(signatureHeader)
  if (!headerParse.valid || !headerParse.hexDigest) {
    return {
      valid: false,
      reason: headerParse.error || 'INVALID_SIGNATURE_HEADER',
      latencyMs: Date.now() - startMs,
    }
  }

  let payloadBytes: Uint8Array
  if (typeof rawPayload === 'string') {
    payloadBytes = new TextEncoder().encode(rawPayload)
  } else if (rawPayload instanceof ArrayBuffer) {
    payloadBytes = new Uint8Array(rawPayload)
  } else {
    payloadBytes = rawPayload
  }

  try {
    const key = await importWebhookSecret(secret)
    const sigBytes = hexToBytes(headerParse.hexDigest)
    const isValid = await crypto.subtle.verify('HMAC', key, sigBytes.buffer as ArrayBuffer, payloadBytes.buffer as ArrayBuffer)

    const latencyMs = Date.now() - startMs
    return {
      valid: isValid,
      reason: isValid ? undefined : 'SIGNATURE_MISMATCH',
      latencyMs,
    }
  } catch (error: any) {
    return {
      valid: false,
      reason: error?.message || 'CRYPTOGRAPHIC_VERIFICATION_EXCEPTION',
      latencyMs: Date.now() - startMs,
    }
  }
}
