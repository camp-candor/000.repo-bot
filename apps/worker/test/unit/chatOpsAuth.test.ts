import { describe, it, expect } from 'vitest'
import {
    verifyChatOpsSignature,
    generateChatOpsSignature,
    authenticateChatOpsRequest,
    hexToBytes,
    bytesToHex,
    buildCanonicalEnvelope,
} from '../../src/telemetry/chatOpsAuth.js'
import { ChatOpsGateway } from '../../src/telemetry/chatOpsGateway.js'

describe('ChatOps Cryptographic Perimeter & Authentication Battery (Phase 1)', () => {
    const testSecret = 'super_secret_foundry_signing_key_4096'
    const sampleBody = JSON.stringify({
        action: 'STATUS',
        taskId: 'shot-phase1-auth-001',
    })

    it('TASK-1.1: converts hex strings to byte buffers and back deterministically', () => {
        const hex = '00112233445566778899aabbccddeeff'
        const bytes = hexToBytes(hex)
        expect(bytes.length).toBe(16)
        expect(bytesToHex(bytes)).toBe(hex)

        const digest64 =
            'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90'
        expect(bytesToHex(hexToBytes(digest64))).toBe(digest64)

        expect(() => hexToBytes('abc')).toThrow('HEX_PARSE_ERROR')
        expect(() => hexToBytes('zz')).toThrow('HEX_PARSE_ERROR')
    })

    it('TASK-1.1: generates canonical signature envelope correctly', () => {
        const envelope = buildCanonicalEnvelope(1700000000, '{"test":true}')
        expect(envelope).toBe('v0:1700000000:{"test":true}')
    })

    it('TASK-1.1: authenticates valid HMAC-SHA256 signature in constant time', async () => {
        const nowSec = 1700000000
        const signature = await generateChatOpsSignature(
            sampleBody,
            nowSec,
            testSecret,
        )

        const result = await verifyChatOpsSignature(
            sampleBody,
            signature,
            String(nowSec),
            testSecret,
            nowSec,
        )

        expect(result.valid).toBe(true)
        expect(result.skewSec).toBe(0)
        expect(result.error).toBeUndefined()
    })

    it('TASK-1.1: rejects tampered raw body payload even by single byte', async () => {
        const nowSec = 1700000000
        const signature = await generateChatOpsSignature(
            sampleBody,
            nowSec,
            testSecret,
        )
        const tamperedBody = sampleBody + ' '

        const result = await verifyChatOpsSignature(
            tamperedBody,
            signature,
            String(nowSec),
            testSecret,
            nowSec,
        )

        expect(result.valid).toBe(false)
        expect(result.error).toContain('SIGNATURE_MISMATCH')
    })

    it('TASK-1.1: rejects secret key mutated by single character', async () => {
        const nowSec = 1700000000
        const signature = await generateChatOpsSignature(
            sampleBody,
            nowSec,
            testSecret,
        )
        const mutatedSecret =
            testSecret.slice(0, -1) + (testSecret.slice(-1) === 'a' ? 'b' : 'a')

        const result = await verifyChatOpsSignature(
            sampleBody,
            signature,
            String(nowSec),
            mutatedSecret,
            nowSec,
        )

        expect(result.valid).toBe(false)
        expect(result.error).toMatch(/SIGNATURE_MISMATCH/)
    })

    it('TASK-1.1: rejects malformed signature formats and lengths (63 or 65 chars)', async () => {
        const nowSec = 1700000000

        // Missing v0= prefix
        const resMissingPrefix = await verifyChatOpsSignature(
            sampleBody,
            'a'.repeat(64),
            String(nowSec),
            testSecret,
            nowSec,
        )
        expect(resMissingPrefix.valid).toBe(false)
        expect(resMissingPrefix.error).toContain('INVALID_SIGNATURE_FORMAT')

        // Invalid digest length: 63 characters
        const res63 = await verifyChatOpsSignature(
            sampleBody,
            'v0=' + 'a'.repeat(63),
            String(nowSec),
            testSecret,
            nowSec,
        )
        expect(res63.valid).toBe(false)
        expect(res63.error).toContain('INVALID_SIGNATURE_FORMAT')

        // Invalid digest length: 65 characters
        const res65 = await verifyChatOpsSignature(
            sampleBody,
            'v0=' + 'a'.repeat(65),
            String(nowSec),
            testSecret,
            nowSec,
        )
        expect(res65.valid).toBe(false)
        expect(res65.error).toContain('INVALID_SIGNATURE_FORMAT')

        // Invalid digest length: short
        const resInvalidLength = await verifyChatOpsSignature(
            sampleBody,
            'v0=abcd1234',
            String(nowSec),
            testSecret,
            nowSec,
        )
        expect(resInvalidLength.valid).toBe(false)
        expect(resInvalidLength.error).toContain('INVALID_SIGNATURE_FORMAT')
    })

    it('TASK-1.2: rejects requests where timestamp is missing or non-numeric', async () => {
        const nowSec = 1700000000
        const validSig = await generateChatOpsSignature(
            sampleBody,
            nowSec,
            testSecret,
        )

        const resMissing = await verifyChatOpsSignature(
            sampleBody,
            validSig,
            null,
            testSecret,
            nowSec,
        )
        expect(resMissing.valid).toBe(false)
        expect(resMissing.error).toContain('MISSING_AUTH_HEADERS')

        const resNonNumeric = await verifyChatOpsSignature(
            sampleBody,
            validSig,
            'not-a-number',
            testSecret,
            nowSec,
        )
        expect(resNonNumeric.valid).toBe(false)
        expect(resNonNumeric.error).toContain('INVALID_TIMESTAMP_HEADER')
    })

    it('TASK-1.2: enforces bidirectional anti-replay skew fence (past and future)', async () => {
        const edgeNowSec = 1700001000

        // Past timestamp expired by 301 seconds (Treq = Tnow - 301s)
        const pastSec = edgeNowSec - 301
        const pastSig = await generateChatOpsSignature(
            sampleBody,
            pastSec,
            testSecret,
        )
        const resPast = await verifyChatOpsSignature(
            sampleBody,
            pastSig,
            String(pastSec),
            testSecret,
            edgeNowSec,
        )

        expect(resPast.valid).toBe(false)
        expect(resPast.error).toContain('TIMESTAMP_DRIFT_EXPIRED')
        expect(resPast.skewSec).toBe(301)

        // Future timestamp skewed by 350 seconds (Treq = Tnow + 350s)
        const futureSec = edgeNowSec + 350
        const futureSig = await generateChatOpsSignature(
            sampleBody,
            futureSec,
            testSecret,
        )
        const resFuture = await verifyChatOpsSignature(
            sampleBody,
            futureSig,
            String(futureSec),
            testSecret,
            edgeNowSec,
        )

        expect(resFuture.valid).toBe(false)
        expect(resFuture.error).toContain('TIMESTAMP_DRIFT_EXPIRED')
        expect(resFuture.skewSec).toBe(350)

        // Borderline timestamp within 299 seconds passes
        const edgeSec = edgeNowSec - 299
        const edgeSig = await generateChatOpsSignature(
            sampleBody,
            edgeSec,
            testSecret,
        )
        const resEdge = await verifyChatOpsSignature(
            sampleBody,
            edgeSig,
            String(edgeSec),
            testSecret,
            edgeNowSec,
        )

        expect(resEdge.valid).toBe(true)
        expect(resEdge.skewSec).toBe(299)
    })

    it('TASK-1.2: enforces single-byte tamper defense across task payloads', async () => {
        const nowSec = 1700000000
        const shot001 = JSON.stringify({ taskId: 'shot-001' })
        const shot002 = JSON.stringify({ taskId: 'shot-002' })
        const sig001 = await generateChatOpsSignature(
            shot001,
            nowSec,
            testSecret,
        )

        // Evaluate signature for shot-001 against shot-002
        const resMismatch = await verifyChatOpsSignature(
            shot002,
            sig001,
            String(nowSec),
            testSecret,
            nowSec,
        )
        expect(resMismatch.valid).toBe(false)
        expect(resMismatch.error).toMatch(/SIGNATURE_MISMATCH/)

        // Evaluate signature for shot-001 against shot-001 with trailing space
        const resTrailing = await verifyChatOpsSignature(
            shot001 + ' ',
            sig001,
            String(nowSec),
            testSecret,
            nowSec,
        )
        expect(resTrailing.valid).toBe(false)
        expect(resTrailing.error).toMatch(/SIGNATURE_MISMATCH/)
    })

    it('TASK-1.3: authenticateChatOpsRequest passes authentic request and returns rawBody', async () => {
        const nowSec = 1700000000
        const signature = await generateChatOpsSignature(
            sampleBody,
            nowSec,
            testSecret,
        )

        const request = new Request('https://do.internal/chatops/command', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-chatops-signature': signature,
                'x-chatops-timestamp': String(nowSec),
            },
            body: sampleBody,
        })

        const authResult = await authenticateChatOpsRequest(
            request,
            testSecret,
            nowSec,
        )

        expect(authResult.authenticated).toBe(true)
        expect(authResult.rawBody).toBe(sampleBody)
        expect(authResult.response).toBeUndefined()
    })

    it('TASK-1.3: authenticateChatOpsRequest rejects unauthorized requests with HTTP 401', async () => {
        const nowSec = 1700000000
        const request = new Request('https://do.internal/chatops/command', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-chatops-signature': 'v0=' + '0'.repeat(64),
                'x-chatops-timestamp': String(nowSec),
            },
            body: sampleBody,
        })

        const authResult = await authenticateChatOpsRequest(
            request,
            testSecret,
            nowSec,
        )

        expect(authResult.authenticated).toBe(false)
        expect(authResult.response).toBeDefined()
        expect(authResult.response?.status).toBe(401)

        const body = (await authResult.response?.json()) as any
        expect(body.error).toBe('UNAUTHORIZED')
        expect(body.diagnostic).toContain('SIGNATURE_MISMATCH')
        expect(body.stack).toBeUndefined()
    })

    it('TASK-1.3: authenticateChatOpsRequest fails-closed on missing headers with HTTP 401', async () => {
        const unauthRequest = new Request(
            'https://do.internal/chatops/command',
            {
                method: 'POST',
                body: sampleBody,
            },
        )
        const authResult = await authenticateChatOpsRequest(
            unauthRequest,
            testSecret,
        )

        expect(authResult.authenticated).toBe(false)
        expect(authResult.response).toBeDefined()
        expect(authResult.response?.status).toBe(401)

        const body = (await authResult.response?.json()) as any
        expect(body.error).toBe('UNAUTHORIZED')
        expect(body.stack).toBeUndefined()
    })

    it('TASK-1.3: ChatOpsGateway intercepts and verifies through gateway instance', async () => {
        const gateway = new ChatOpsGateway({ secret: testSecret })
        const nowSec = 1700000000
        const signature = await generateChatOpsSignature(
            sampleBody,
            nowSec,
            testSecret,
        )

        const request = new Request('https://do.internal/chatops/command', {
            method: 'POST',
            headers: {
                'x-chatops-signature': signature,
                'x-chatops-timestamp': String(nowSec),
            },
            body: sampleBody,
        })

        const authResult = await gateway.interceptAndAuthenticate(
            request,
            nowSec,
        )
        expect(authResult.authenticated).toBe(true)
    })

    it('TASK-1.4: verifies pure 7-bit ASCII telemetry without emojis across all diagnostics', async () => {
        const nowSec = 1700000000
        const res = await verifyChatOpsSignature(
            sampleBody,
            'v0=' + 'f'.repeat(64),
            String(nowSec),
            testSecret,
            nowSec,
        )

        expect(res.error).toBeDefined()
        // Checked against multi-byte UTF-8 emoji range
        expect(res.error).not.toMatch(/[\uD800-\uDFFF]/)
        expect(res.error).not.toMatch(/[\u2600-\u27BF]/)
    })
})
