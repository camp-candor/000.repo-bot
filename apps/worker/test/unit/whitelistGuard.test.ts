import { describe, it, expect } from 'vitest'
import {
  evaluateWhitelistConformance,
  matchesWhitelistPattern,
  parseWhitelistFromMarkdown,
  formatWhitelistDiagnostic,
  normalizePath,
} from '../../src/audit/whitelistGuard.js'

describe('Whitelist Conformance Verification Guard (apps/worker)', () => {
  it('normalizes paths to clean POSIX format', () => {
    expect(normalizePath('apps\\worker\\src\\audit\\whitelistGuard.ts')).toBe(
      'apps/worker/src/audit/whitelistGuard.ts'
    )
    expect(normalizePath('/data/directive/day-001/')).toBe('data/directive/day-001')
  })

  it('matches exact path literals', () => {
    expect(
      matchesWhitelistPattern(
        'apps/worker/src/index.ts',
        'apps/worker/src/index.ts'
      )
    ).toBe(true)
    expect(
      matchesWhitelistPattern(
        'apps/worker/src/tools.ts',
        'apps/worker/src/index.ts'
      )
    ).toBe(false)
  })

  it('matches single-level directory wildcards', () => {
    expect(
      matchesWhitelistPattern(
        'apps/worker/package.json',
        'apps/worker/*'
      )
    ).toBe(true)
    expect(
      matchesWhitelistPattern(
        'apps/worker/src/index.ts',
        'apps/worker/*'
      )
    ).toBe(false)
  })

  it('matches recursive directory wildcards', () => {
    expect(
      matchesWhitelistPattern(
        'apps/worker/src/security/webhookSignature.ts',
        'apps/worker/**'
      )
    ).toBe(true)
    expect(
      matchesWhitelistPattern(
        'packages/821.repobot/BEE.ts',
        'apps/worker/**'
      )
    ).toBe(false)
  })

  it('parses allowlist from embedded HTML comments', () => {
    const md = '<!-- file_whitelist: ["apps/worker/src/**", "data/directive/day-001.md"] -->'
    const list = parseWhitelistFromMarkdown(md)
    expect(list).toEqual(['apps/worker/src/**', 'data/directive/day-001.md'])
  })

  it('parses allowlist from markdown sections', () => {
    const md = `
# Task Spec
## Scope Whitelist
* \`apps/worker/src/audit/whitelistGuard.ts\`
* \`apps/worker/test/unit/whitelistGuard.test.ts\`

## Other Section
`
    const list = parseWhitelistFromMarkdown(md)
    expect(list).toEqual([
      'apps/worker/src/audit/whitelistGuard.ts',
      'apps/worker/test/unit/whitelistGuard.test.ts',
    ])
  })

  it('evaluates fully conforming file diffs as valid', () => {
    const files = [
      'apps/worker/src/audit/whitelistGuard.ts',
      'apps/worker/test/unit/whitelistGuard.test.ts',
    ]
    const patterns = ['apps/worker/src/**', 'apps/worker/test/**']

    const res = evaluateWhitelistConformance(files, patterns)
    expect(res.valid).toBe(true)
    expect(res.approvedFiles.length).toBe(2)
    expect(res.unapprovedFiles.length).toBe(0)
    expect(res.primaryError).toBeUndefined()
    expect(res.diagnosticReport).toContain('[OK]')
  })

  it('fails closed when unapproved file paths are modified', () => {
    const files = [
      'apps/worker/src/audit/whitelistGuard.ts',
      'packages/100.agent/src/identity.ts',
    ]
    const patterns = ['apps/worker/src/**']

    const res = evaluateWhitelistConformance(files, patterns)
    expect(res.valid).toBe(false)
    expect(res.approvedFiles).toEqual(['apps/worker/src/audit/whitelistGuard.ts'])
    expect(res.unapprovedFiles).toEqual(['packages/100.agent/src/identity.ts'])
    expect(res.primaryError).toBe('SCOPE_VIOLATION_UNAPPROVED_PATH')
    expect(res.diagnosticReport).toContain('SCOPE_VIOLATION_UNAPPROVED_PATH')
  })

  it('verifies 7-bit clean ASCII compliance in formatted diagnostic report', () => {
    const report = formatWhitelistDiagnostic(
      false,
      ['packages/unauthorized.ts'],
      ['apps/worker/authorized.ts'],
      ['apps/worker/**']
    )
    expect(/^[\x20-\x7E\r\n\t]+$/.test(report)).toBe(true)
  })
})
