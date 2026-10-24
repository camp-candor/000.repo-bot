import { describe, it, expect } from 'vitest'
import {
    redactSecrets,
    redactSensitiveData,
    redactObject,
} from '../../src/redaction.js'

describe('In-Flight Secret Redaction Firewall (apps/worker)', () => {
    describe('redactSecrets (String Scrubber)', () => {
        it('redacts classic GitHub Personal Access Tokens (ghp_*)', () => {
            const raw =
                'Error connecting with ghp_111122223333444455556666777788889999 to upstream.'
            const result = redactSecrets(raw)
            expect(result).toBe(
                'Error connecting with [REDACTED_GH_TOKEN] to upstream.',
            )
            expect(result).not.toContain('ghp_')
        })

        it('redacts fine-grained GitHub PATs (github_pat_*)', () => {
            const token =
                'github_pat_11AAAAAAA0000000000000000000000000000000000000000000000000000000000000000000000000'
            const raw = `Authorization failure for token ${token}`
            const result = redactSecrets(raw)
            expect(result).toBe(
                'Authorization failure for token [REDACTED_GH_PAT]',
            )
            expect(result).not.toContain(token)
        })

        it('redacts Cloudflare AI Gateway universal tokens (cfut_*)', () => {
            const token = 'cfut_abcdef1234567890abcdef1234567890abcdef12'
            const raw = `Gateway rejected: ${token}`
            const result = redactSecrets(raw)
            expect(result).toBe('Gateway rejected: [REDACTED_CF_GATEWAY_TOKEN]')
            expect(result).not.toContain(token)
        })

        it('redacts Slack OAuth tokens (xoxb-*, xoxp-*)', () => {
            const raw =
                'Failed to notify Slack with xoxb-mockslacktoken1234567890'
            const result = redactSecrets(raw)
            expect(result).toBe(
                'Failed to notify Slack with [REDACTED_SLACK_TOKEN]',
            )
        })

        it('redacts multi-line private keys', () => {
            const raw =
                'Failed loading key: -----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0m...\n-----END RSA PRIVATE KEY----- in config.'
            const result = redactSecrets(raw)
            expect(result).toBe(
                'Failed loading key: [REDACTED_PRIVATE_KEY] in config.',
            )
            expect(result).not.toContain('MIIEow')
        })

        it('redacts Authorization Bearer tokens in headers', () => {
            const raw =
                'HTTP 401: Headers contained Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'
            const result = redactSecrets(raw)
            expect(result).toBe(
                'HTTP 401: Headers contained Bearer [REDACTED_AUTH_TOKEN]',
            )
        })

        it('redacts key-value fields in stringified JSON payloads', () => {
            const raw = '{"token":"super_secret_value_123","status":"active"}'
            const result = redactSecrets(raw)
            expect(result).toBe(
                '{"token":"[REDACTED_FIELD]","status":"active"}',
            )
            expect(result).not.toContain('super_secret_value_123')
        })

        it('supports canonical alias redactSensitiveData', () => {
            const raw = 'Token: ghp_111122223333444455556666777788889999'
            expect(redactSensitiveData(raw)).toBe('Token: [REDACTED_GH_TOKEN]')
        })

        it('returns non-string values or clean strings unmodified', () => {
            expect(redactSecrets('')).toBe('')
            expect(redactSecrets('Everything is operational.')).toBe(
                'Everything is operational.',
            )
        })
    })

    describe('redactObject (Recursive Object Scrubber)', () => {
        it('recursively scrubs nested object properties matching credential keys', () => {
            const payload = {
                user: 'octocat',
                auth: {
                    apiKey: 'sensitive_key_abc',
                    nested: {
                        token: 'ghp_111122223333444455556666777788889999',
                        normal: 'safe_value',
                    },
                },
                list: [
                    'plain text',
                    'contains ghp_111122223333444455556666777788889999',
                ],
            }

            const clean = redactObject(payload)

            expect(clean.auth.apiKey).toBe('[REDACTED_FIELD]')
            expect(clean.auth.nested.token).toBe('[REDACTED_FIELD]')
            expect(clean.auth.nested.normal).toBe('safe_value')
            expect(clean.list[1]).toBe('contains [REDACTED_GH_TOKEN]')
            expect(clean.user).toBe('octocat')
        })
    })
})
