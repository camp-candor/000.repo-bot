import { describe, it, expect } from 'vitest'
import { verifyHmacSignature, importHmacKey } from '../02.firewall.unit/buz/firewall.buzz.js'

describe('Local Cryptographic Ingress Verification (02.firewall.unit)', () => {
  const secret = 'test-secret-token-key-12345'
  const payload = JSON.stringify({ action: 'opened', pull_request: { number: 42 } })

  it('verifies valid HMAC-SHA256 signature in constant time', async () => {
    const encoder = new TextEncoder()
    const key = await importHmacKey(secret)
    const sigBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(payload))
    const hexSig = Array.from(new Uint8Array(sigBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')

    const header = `sha256=${hexSig}`
    const result = await verifyHmacSignature(payload, header, secret)
    expect(result.valid).toBe(true)
    expect(result.reason).toBeUndefined()
  })

  it('rejects tampered payload', async () => {
    const encoder = new TextEncoder()
    const key = await importHmacKey(secret)
    const sigBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(payload))
    const hexSig = Array.from(new Uint8Array(sigBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')

    const header = `sha256=${hexSig}`
    const tamperedPayload = JSON.stringify({ action: 'opened', pull_request: { number: 43 } })
    const result = await verifyHmacSignature(tamperedPayload, header, secret)
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('SIGNATURE_MISMATCH')
  })

  it('rejects single-byte mutated signature', async () => {
    const encoder = new TextEncoder()
    const key = await importHmacKey(secret)
    const sigBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(payload))
    const rawSig = Array.from(new Uint8Array(sigBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')

    const mutatedChar = rawSig[0] === 'a' ? 'b' : 'a'
    const tamperedHex = mutatedChar + rawSig.slice(1)
    const header = `sha256=${tamperedHex}`

    const result = await verifyHmacSignature(payload, header, secret)
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('SIGNATURE_MISMATCH')
  })

  it('rejects missing or malformed header prefix', async () => {
    const result = await verifyHmacSignature(payload, 'sha1=abcdef', secret)
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('MISSING_OR_MALFORMED_SIGNATURE_HEADER')
  })
})
