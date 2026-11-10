import { describe, it, expect } from 'vitest'
import {
  evaluateDiffBoundaries,
  normalizeFilePath,
  detectPathTraversal,
  matchesProtectedPattern,

  type DiffFileEntry,
} from '../../src/audit/diffBoundarySentinel.js'

describe('Diff Boundary Inspection Sentinel (apps/worker)', () => {
  it('normalizes file paths cleanly across mixed slash styles', () => {
    expect(normalizeFilePath('apps\\worker\\src\\index.ts')).toBe('apps/worker/src/index.ts')
    expect(normalizeFilePath('/data/directive/day-001/')).toBe('data/directive/day-001')
  })

  it('detects directory traversal patterns and null byte injections', () => {
    expect(detectPathTraversal('apps/worker/../../.github/workflows/ci.yml')).toBe(true)
    expect(detectPathTraversal('data/%2e%2e/secret.env')).toBe(true)
    expect(detectPathTraversal('apps/worker/src/index.ts\0.js')).toBe(true)
    expect(detectPathTraversal('apps/worker/src/index.ts')).toBe(false)
  })

  it('identifies protected infrastructure patterns across workflows, tests, and manifests', () => {
    expect(matchesProtectedPattern('.github/workflows/deploy.yml')).toBe(true)
    expect(matchesProtectedPattern('tests/integration/smoke.test.ts')).toBe(true)
    expect(matchesProtectedPattern('apps/worker/vitest.config.ts')).toBe(true)
    expect(matchesProtectedPattern('package.json')).toBe(true)
    expect(matchesProtectedPattern('apps/worker/wrangler.jsonc')).toBe(true)
    expect(matchesProtectedPattern('apps/995.library/995.library/00.library.unit/library.model.ts')).toBe(true)
    expect(matchesProtectedPattern('apps/worker/src/audit/diffBoundarySentinel.ts')).toBe(false)
  })

  it('passes valid diff entries within blast radius limits', () => {
    const files: DiffFileEntry[] = [
      { filename: 'apps/worker/src/audit/diffBoundarySentinel.ts', status: 'added' },
      { filename: 'apps/worker/src/types/env.ts', status: 'modified' },
    ]

    const result = evaluateDiffBoundaries(files)
    expect(result.valid).toBe(true)
    expect(result.fileCount).toBe(2)
    expect(result.violations.length).toBe(0)
    expect(result.primaryError).toBeUndefined()
  })

  it('fails closed when blast radius exceeds maximum 50 files', () => {
    const files: DiffFileEntry[] = Array.from({ length: 51 }, (_, i) => ({
      filename: `data/notes/item_${i}.txt`,
      status: 'added',
    }))

    const result = evaluateDiffBoundaries(files)
    expect(result.valid).toBe(false)
    expect(result.fileCount).toBe(51)
    expect(result.primaryError).toBe('BLAST_RADIUS_EXCEEDED_MAX_50_FILES')
  })

  it('fails closed when empty diff is presented', () => {
    const result = evaluateDiffBoundaries([])
    expect(result.valid).toBe(false)
    expect(result.primaryError).toBe('EMPTY_DIFF_VACUOUS_PR')
  })

  it('rejects diff touching protected infrastructure paths', () => {
    const files: DiffFileEntry[] = [
      { filename: 'apps/worker/src/audit/diffBoundarySentinel.ts', status: 'modified' },
      { filename: '.github/workflows/deploy.yml', status: 'modified' },
    ]

    const result = evaluateDiffBoundaries(files)
    expect(result.valid).toBe(false)
    expect(result.violations.some((v) => v.rule === 'PROTECTED_INFRASTRUCTURE_MUTATION_BREACH')).toBe(true)
  })

  it('rejects rename evasion attempting to move protected files', () => {
    const files: DiffFileEntry[] = [
      {
        filename: 'apps/worker/src/safeName.ts',
        previous_filename: 'vitest.config.ts',
        status: 'renamed',
      },
    ]

    const result = evaluateDiffBoundaries(files)
    expect(result.valid).toBe(false)
    expect(result.violations.some((v) => v.rule === 'PROTECTED_INFRASTRUCTURE_RENAME_BREACH')).toBe(true)
  })

  it('rejects symbolic link creation attempts', () => {
    const files: DiffFileEntry[] = [
      {
        filename: 'apps/worker/src/link_target.ts',
        status: 'added',
        mode: '120000',
      },
    ]

    const result = evaluateDiffBoundaries(files)
    expect(result.valid).toBe(false)
    expect(result.primaryError).toBe('FORBIDDEN_SYMLINK_CREATION')
  })
})
