import type { FirewallModel } from '../firewall.model.js'
import type FirewallBit from '../fce/firewall.bit.js'
import type State from '../../99.core/state.js'

export const initFirewall = (cpy: FirewallModel, bal: FirewallBit, ste: State) => {
  if (bal.slv) bal.slv({ fwlBit: { idx: 'init-firewall', dat: cpy } })
  return cpy
}

export const importHmacKey = async (secret: string): Promise<CryptoKey> => {
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

export const verifyHmacSignature = async (
  rawPayload: Uint8Array | string,
  signatureHeader: string,
  secret: string
): Promise<{ valid: boolean; reason?: string }> => {
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
    return { valid: false, reason: 'MISSING_OR_MALFORMED_SIGNATURE_HEADER' }
  }

  const hexDigest = signatureHeader.slice(7).trim()
  if (hexDigest.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(hexDigest)) {
    return { valid: false, reason: 'INVALID_DIGEST_LENGTH' }
  }

  const sigBytes = new Uint8Array(32)
  for (let i = 0; i < 32; i++) {
    sigBytes[i] = parseInt(hexDigest.slice(i * 2, i * 2 + 2), 16)
  }

  const payloadBytes =
    typeof rawPayload === 'string' ? new TextEncoder().encode(rawPayload) : rawPayload

  const key = await importHmacKey(secret)
  const valid = await crypto.subtle.verify('HMAC', key, sigBytes.buffer as ArrayBuffer, payloadBytes as BufferSource)

  return {
    valid,
    reason: valid ? undefined : 'SIGNATURE_MISMATCH'
  }
}

export const verifyWebhookSignature = async (
  cpy: FirewallModel,
  bal: FirewallBit,
  ste: State
) => {
  cpy.totalVerifications += 1
  cpy.lastVerificationTimestamp = Date.now()

  if (!bal.rawPayload || !bal.signatureHeader || !bal.secret) {
    cpy.failedVerifications += 1
    cpy.lastRejectReason = 'INCOMPLETE_VERIFICATION_PAYLOAD'
    if (bal.slv) {
      bal.slv({
        fwlBit: {
          idx: 'verify-webhook-signature-fail',
          val: 0,
          dat: { valid: false, reason: cpy.lastRejectReason }
        }
      })
    }
    return cpy
  }

  try {
    const result = await verifyHmacSignature(bal.rawPayload, bal.signatureHeader, bal.secret)
    if (!result.valid) {
      cpy.failedVerifications += 1
      cpy.lastRejectReason = result.reason || 'SIGNATURE_MISMATCH'
    }

    if (bal.slv) {
      bal.slv({
        fwlBit: {
          idx: result.valid ? 'verify-webhook-signature-ok' : 'verify-webhook-signature-fail',
          val: result.valid ? 1 : 0,
          dat: result
        }
      })
    }
  } catch (error: any) {
    cpy.failedVerifications += 1
    cpy.lastRejectReason = error.message || 'CRYPTOGRAPHIC_VERIFICATION_EXCEPTION'
    if (bal.slv) {
      bal.slv({
        fwlBit: {
          idx: 'verify-webhook-signature-err',
          val: 0,
          dat: { valid: false, reason: cpy.lastRejectReason }
        }
      })
    }
  }

  return cpy
}
