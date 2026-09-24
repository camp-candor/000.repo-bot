import { describe, it, expect } from 'vitest'
import { canonicalizeJson } from '../../src/audit/canonicalJson.js'
import { redactSensitiveData } from '../../src/audit/redaction.js'

describe('Canonical JSON & Redaction Suite', () => {
    it('sorts keys lexicographically regardless of insertion order', () => {
        const objA = { z: 1, a: 2, m: { y: 3, x: 4 } }
        const objB = { a: 2, m: { x: 4, y: 3 }, z: 1 }
        expect(canonicalizeJson(objA)).toBe(canonicalizeJson(objB))
        expect(canonicalizeJson(objA)).toBe('{"a":2,"m":{"x":4,"y":3},"z":1}')
    })

    it('redacts GitHub PATs and Slack tokens synchronously', () => {
        const dirty = JSON.stringify({
            token: ['ghp', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'].join('_'),
            slack: [
                'xoxb',
                '123456789012',
                '1234567890123',
                'abcdefghijklmnopqrstuvwx',
            ].join('-'),
            safe: 'valid-commit-sha',
        })
        const clean = redactSensitiveData(dirty)
        expect(clean).toContain('[REDACTED_GH_TOKEN]')
        expect(clean).toContain('[REDACTED_SLACK_TOKEN]')
        expect(clean).not.toContain('ghp_ABC')
    })
})
