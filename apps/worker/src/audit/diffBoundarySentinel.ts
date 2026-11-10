/**
 * apps/worker/src/audit/diffBoundarySentinel.ts
 *
 * Edge-native structural diff boundary sentinel and blast-radius evaluator.
 * Pure 7-bit clean ASCII compliance.
 */

export interface DiffFileEntry {
  readonly filename: string
  readonly previous_filename?: string
  readonly status?: 'added' | 'modified' | 'removed' | 'renamed'
  readonly additions?: number
  readonly deletions?: number
  readonly mode?: string
}

export interface BoundaryViolation {
  readonly filename: string
  readonly rule: string
  readonly reason: string
}

export interface DiffBoundaryEvaluationResult {
  readonly valid: boolean
  readonly fileCount: number
  readonly violations: readonly BoundaryViolation[]
  readonly primaryError?: string
}

export const MAX_BLAST_RADIUS_FILES = 50

export const PROTECTED_INFRASTRUCTURE_PATTERNS: readonly RegExp[] = [
  /^\.github\//i,
  /(^|\/)tests?\//i,
  /(^|\/)[^/]+\.test\.[a-zA-Z0-9]+$/i,
  /(^|\/)[^/]+\.spec\.[a-zA-Z0-9]+$/i,
  /(^|\/)package(-lock)?\.json$/i,
  /(^|\/)pnpm-lock\.yaml$/i,
  /(^|\/)tsconfig(\.[^/]+)?\.json$/i,
  /(^|\/)vitest.*\.config\.[a-zA-Z0-9]+$/i,
  /(^|\/)\.?eslint/i,
  /(^|\/)Dockerfile$/i,
  /(^|\/)wrangler\.(jsonc?|toml)$/i,
  /^\.husky\//i,
  /^CODEOWNERS$/i,
  /^apps\/995\.library\/995\.library\//i,
  /^benchmarks\/golden_set\//i,
]

/**
 * Normalizes file paths to POSIX standard, stripping leading slashes and whitespace.
 */
export function normalizeFilePath(pathStr: string): string {
  return pathStr.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '').trim()
}

/**
 * Detects relative traversal or root injection vectors.
 */
export function detectPathTraversal(pathStr: string): boolean {
  const normalized = normalizeFilePath(pathStr)
  const segments = normalized.split('/')
  return (
    segments.includes('..') ||
    segments.includes('.') ||
    normalized.includes('%2e%2e') ||
    normalized.includes('\0')
  )
}

/**
 * Checks if a given path matches any protected infrastructure regex.
 */
export function matchesProtectedPattern(pathStr: string): boolean {
  const normalized = normalizeFilePath(pathStr)
  return PROTECTED_INFRASTRUCTURE_PATTERNS.some((pattern) => pattern.test(normalized))
}

/**
 * Pure boundary evaluator checking file counts, traversal, and protected inodes.
 */
export function evaluateDiffBoundaries(
  files: readonly DiffFileEntry[]
): DiffBoundaryEvaluationResult {
  const violations: BoundaryViolation[] = []

  // 1. Blast Radius Ceiling Check
  if (files.length > MAX_BLAST_RADIUS_FILES) {
    violations.push({
      filename: `[TOTAL_FILES_COUNT: ${files.length}]`,
      rule: 'BLAST_RADIUS_EXCEEDED_MAX_50_FILES',
      reason: `Total changed files (${files.length}) exceeds maximum limit (${MAX_BLAST_RADIUS_FILES})`,
    })
  }

  // 2. Empty Diff Sentinel
  if (files.length === 0) {
    violations.push({
      filename: '[EMPTY_DIFF]',
      rule: 'EMPTY_DIFF_VACUOUS_PR',
      reason: 'Pull request diff contains zero files',
    })
  }

  // 3. Inode Traversal and Protected Invariants Check
  for (const file of files) {
    const current = normalizeFilePath(file.filename)
    const previous = file.previous_filename ? normalizeFilePath(file.previous_filename) : undefined

    // Path traversal check (current and rename origin)
    if (detectPathTraversal(current)) {
      violations.push({
        filename: current,
        rule: 'DIRECTORY_TRAVERSAL_DETECTED',
        reason: 'Path traversal token detected in target filename',
      })
      continue
    }

    if (previous && detectPathTraversal(previous)) {
      violations.push({
        filename: previous,
        rule: 'DIRECTORY_TRAVERSAL_DETECTED',
        reason: 'Path traversal token detected in previous filename',
      })
      continue
    }

    // Symlink creation check (Git mode 120000)
    if (file.mode === '120000') {
      violations.push({
        filename: current,
        rule: 'FORBIDDEN_SYMLINK_CREATION',
        reason: 'Creation of symbolic links is strictly prohibited',
      })
      continue
    }

    // Protected path check (target file)
    if (matchesProtectedPattern(current)) {
      violations.push({
        filename: current,
        rule: 'PROTECTED_INFRASTRUCTURE_MUTATION_BREACH',
        reason: 'Modification of protected infrastructure path is forbidden',
      })
    }

    // Protected path rename origin check
    if (previous && matchesProtectedPattern(previous)) {
      violations.push({
        filename: previous,
        rule: 'PROTECTED_INFRASTRUCTURE_RENAME_BREACH',
        reason: 'Renaming or moving protected infrastructure asset is forbidden',
      })
    }
  }

  const valid = violations.length === 0
  return {
    valid,
    fileCount: files.length,
    violations,
    primaryError: valid ? undefined : violations[0]?.rule,
  }
}
