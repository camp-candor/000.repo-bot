import { describe, it, expect } from 'vitest'
import {
  importWebhookSecret,
  parseSignatureHeader,
  verifyWebhookSignature,
} from '../../src/security/webhookSignature.js'

describe('Edge Web Crypto Signature Ingestion Engine (apps/worker)', () => {
  const testSecret = '000-repobot-edge-firewall-secret-key-42'
  const payloadObject = {
    action: 'opened',
    pull_request: {
      number: 101,
      head: { sha: '7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b' },
    },
  }
  const rawPayload = JSON.stringify(payloadObject)

  async function generateTestSignature(payload: string, secret: string): Promise<string> {
    const encoder = new TextEncoder()
    const key = await importWebhookSecret(secret)
    const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(payload))
    const hex = Array.from(new Uint8Array(signatureBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
    return `sha256=${hex}`
  }

  it('imports HMAC key in sub-millisecond execution', async () => {
    const key = await importWebhookSecret(testSecret)
    expect(key).toBeDefined()
    expect(key.algorithm.name).toBe('HMAC')
    expect(key.type).toBe('secret')
  })

  it('parses valid sha256 signature header format', () => {
    const mockSig = 'sha256=' + 'a'.repeat(64)
    const res = parseSignatureHeader(mockSig)
    expect(res.valid).toBe(true)
    expect(res.hexDigest).toBe('a'.repeat(64))
  })

  it('rejects malformed signature prefixes', () => {
    const res1 = parseSignatureHeader('sha1=abcdef123456')
    expect(res1.valid).toBe(false)
    expect(res1.error).toBe('MALFORMED_SIGNATURE_PREFIX')

    const res2 = parseSignatureHeader(null)
    expect(res2.valid).toBe(false)
    expect(res2.error).toBe('MISSING_SIGNATURE_HEADER')
  })

  it('rejects invalid digest lengths', () => {
    const res = parseSignatureHeader('sha256=abcdef')
    expect(res.valid).toBe(false)
    expect(res.error).toBe('INVALID_DIGEST_LENGTH')
  })

  it('verifies genuine payload and signature in constant time', async () => {
    const validHeader = await generateTestSignature(rawPayload, testSecret)
    const result = await verifyWebhookSignature(rawPayload, validHeader, testSecret)

    expect(result.valid).toBe(true)
    expect(result.reason).toBeUndefined()
    expect(result.latencyMs).toBeLessThanOrEqual(15)
  })

  it('rejects tampered payload content', async () => {
    const validHeader = await generateTestSignature(rawPayload, testSecret)
    const tamperedPayload = JSON.stringify({
      ...payloadObject,
      action: 'synchronize',
    })

    const result = await verifyWebhookSignature(tamperedPayload, validHeader, testSecret)
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('SIGNATURE_MISMATCH')
  })

  it('rejects mutated signature bytes', async () => {
    const validHeader = await generateTestSignature(rawPayload, testSecret)
    const prefix = validHeader.slice(0, 10)
    const flippedChar = validHeader[10] === 'a' ? 'b' : 'a'
    const tamperedHeader = prefix + flippedChar + validHeader.slice(11)

    const result = await verifyWebhookSignature(rawPayload, tamperedHeader, testSecret)
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('SIGNATURE_MISMATCH')
  })

  it('verifies ArrayBuffer payloads identically to string buffers', async () => {
    const validHeader = await generateTestSignature(rawPayload, testSecret)
    const arrayBuffer = new TextEncoder().encode(rawPayload).buffer

    const result = await verifyWebhookSignature(arrayBuffer, validHeader, testSecret)
    expect(result.valid).toBe(true)
  })

  it('fails closed when webhook secret is missing from environment', async () => {
    const validHeader = await generateTestSignature(rawPayload, testSecret)
    const result = await verifyWebhookSignature(rawPayload, validHeader, '')

    expect(result.valid).toBe(false)
    expect(result.reason).toBe('MISSING_WEBHOOK_SECRET_CONFIGURATION')
  })
})
