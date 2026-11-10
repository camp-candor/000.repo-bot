/**
 * apps/worker/src/audit/whitelistGuard.ts
 *
 * Edge-native task specification file allowlist comparator and validator.
 * Enforces fail-closed path isolation without external glob dependencies.
 * Pure 7-bit clean ASCII compliance.
 */

export interface WhitelistConformanceResult {
  readonly valid: boolean
  readonly approvedFiles: readonly string[]
  readonly unapprovedFiles: readonly string[]
  readonly diagnosticReport: string
  readonly primaryError?: string
}

/**
 * Normalizes file and glob paths to standard POSIX format.
 */
export function normalizePath(pathStr: string): string {
  return pathStr.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '').trim()
}

/**
 * Compiles a wildcard pattern into a RegExp.
 * Supports:
 * - Literal file paths: 'apps/worker/src/index.ts'
 * - Single-level wildcards: 'apps/worker/*' (matches immediate directory children)
 * - Recursive wildcards: 'apps/worker/**' (matches all subdirectories and files)
 */
export function globToRegex(globPattern: string): RegExp {
  const normalized = normalizePath(globPattern)

  // Escape special regex characters except asterisk
  const escaped = normalized.replace(/[.+?^${}()|[\]\\]/g, '\\$&')

  // Transform recursive and single-level wildcards
  const regexStr = escaped
    .replace(/\*\*/g, '___DOUBLE_STAR___')
    .replace(/\*/g, '[^/]+')
    .replace(/___DOUBLE_STAR___/g, '.*')

  return new RegExp(`^${regexStr}$`, 'i')
}

/**
 * Tests if a candidate path satisfies a single whitelist pattern.
 */
export function matchesWhitelistPattern(candidatePath: string, pattern: string): boolean {
  const normCandidate = normalizePath(candidatePath)
  const normPattern = normalizePath(pattern)

  // Direct literal match optimization
  if (normCandidate.toLowerCase() === normPattern.toLowerCase()) {
    return true
  }

  const regex = globToRegex(normPattern)
  return regex.test(normCandidate)
}

/**
 * Extracts allowed file paths from markdown body metadata.
 * Supports:
 * 1. Embedded HTML comment: <!-- file_whitelist: ["path1", "path2/**"] -->
 * 2. Markdown list under ## Whitelist or ## Scope Whitelist
 */
export function parseWhitelistFromMarkdown(bodyText: string | null | undefined): string[] {
  if (!bodyText) return []

  // Pattern 1: Embedded JSON in HTML comment
  const commentMatch = bodyText.match(/<!--\s*file_whitelist:\s*(\[.*?\])\s*-->/s)
  if (commentMatch && commentMatch[1]) {
    try {
      const parsed = JSON.parse(commentMatch[1])
      if (Array.isArray(parsed)) {
        return parsed.map((p) => normalizePath(String(p)))
      }
    } catch {}
  }

  // Pattern 2: Markdown header ## Whitelist or ## Scope Whitelist
  const sectionMatch = bodyText.match(/##\s*(?:Scope\s*)?Whitelist\s*([\s\S]*?)(?:\n##|$)/i)
  if (sectionMatch && sectionMatch[1]) {
    const lines = sectionMatch[1].split('\n')
    const paths: string[] = []
    for (const line of lines) {
      const clean = line.replace(/^[\s*-]+/, '').trim()
      const codeMatch = clean.match(/^`([^`]+)`/)
      if (codeMatch && codeMatch[1]) {
        paths.push(normalizePath(codeMatch[1]))
      } else if (clean && !clean.startsWith('#') && !clean.startsWith('<!--')) {
        paths.push(normalizePath(clean))
      }
    }
    if (paths.length > 0) return paths
  }

  return []
}

/**
 * Generates a clean 7-bit ASCII diagnostic summary report.
 */
export function formatWhitelistDiagnostic(
  valid: boolean,
  unapprovedFiles: readonly string[],
  approvedFiles: readonly string[],
  declaredPatterns: readonly string[]
): string {
  if (valid) {
    return [
      '>> [WHITELIST::AUDIT] SCOPE CONFORMANCE VERIFIED [OK]',
      `>> [APPROVED_COUNT] ${approvedFiles.length} file(s) matched declared allowlist`,
    ].join('\n')
  }

  const lines: string[] = [
    '>> [WHITELIST::AUDIT] SCOPE VIOLATION DETECTED [FAIL]',
    `>> [PRIMARY_ERROR] SCOPE_VIOLATION_UNAPPROVED_PATH`,
    `>> [UNAPPROVED_COUNT] ${unapprovedFiles.length} unauthorized file(s) touched`,
    '>> [UNAPPROVED_FILES]:',
  ]

  for (const file of unapprovedFiles) {
    lines.push(`   * ${file}`)
  }

  lines.push('>> [DECLARED_ALLOWLIST_PATTERNS]:')
  for (const pattern of declaredPatterns) {
    lines.push(`   - ${pattern}`)
  }

  return lines.join('\n')
}

/**
 * Pure evaluator matching modified file paths against declared whitelist patterns.
 */
export function evaluateWhitelistConformance(
  candidateFiles: readonly string[],
  declaredPatterns: readonly string[]
): WhitelistConformanceResult {
  // If no patterns are declared, allowlist evaluation is vacuous or unrestricted
  if (declaredPatterns.length === 0) {
    return {
      valid: true,
      approvedFiles: [...candidateFiles],
      unapprovedFiles: [],
      diagnosticReport: '>> [WHITELIST::AUDIT] NO ALLOWLIST DECLARED - PASS THROUGH [OK]',
    }
  }

  const approvedFiles: string[] = []
  const unapprovedFiles: string[] = []

  for (const file of candidateFiles) {
    const normalized = normalizePath(file)
    const isApproved = declaredPatterns.some((pattern) =>
      matchesWhitelistPattern(normalized, pattern)
    )

    if (isApproved) {
      approvedFiles.push(normalized)
    } else {
      unapprovedFiles.push(normalized)
    }
  }

  const valid = unapprovedFiles.length === 0
  const diagnosticReport = formatWhitelistDiagnostic(
    valid,
    unapprovedFiles,
    approvedFiles,
    declaredPatterns
  )

  return {
    valid,
    approvedFiles,
    unapprovedFiles,
    diagnosticReport,
    primaryError: valid ? undefined : 'SCOPE_VIOLATION_UNAPPROVED_PATH',
  }
}
