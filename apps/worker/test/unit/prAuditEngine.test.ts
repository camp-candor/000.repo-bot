import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
    isProtectedPath,
    hasTraversal,
    extractWhitelist,
    auditPullRequest,
    type GitHubPullRequestFile,
} from '../../src/prAuditEngine.js'
import type { Env } from '../../src/tools.js'

describe('prAuditEngine — Zero-Trust Diff Auditor & Firewall', () => {
    const mockEnv = {
        GITHUB_TOKEN: 'ghp_test_token_123',
        GITHUB_WEBHOOK_SECRET: 'super_secret_webhook_key',
    } as Env

    const originalFetch = globalThis.fetch

    beforeEach(() => {
        vi.restoreAllMocks()
    })

    afterEach(() => {
        globalThis.fetch = originalFetch
    })

    describe('Immutable Path Firewall Regex', () => {
        it('identifies and blocks forbidden files', () => {
            expect(isProtectedPath('.github/workflows/deploy.yml')).toBe(true)
            expect(isProtectedPath('tests/invariants.test.ts')).toBe(true)
            expect(isProtectedPath('src/components/button.test.tsx')).toBe(true)
            expect(isProtectedPath('package.json')).toBe(true)
            expect(isProtectedPath('apps/worker/package.json')).toBe(true)
            expect(isProtectedPath('tsconfig.json')).toBe(true)
            expect(isProtectedPath('vitest.config.ts')).toBe(true)
        })

        it('permits valid domain files', () => {
            expect(isProtectedPath('src/scenes/ep101_sc03.json')).toBe(false)
            expect(isProtectedPath('packages/001.lore/characters/bog.md')).toBe(
                false,
            )
            expect(isProtectedPath('apps/worker/src/index.ts')).toBe(false)
        })

        it('detects directory traversal attempts', () => {
            expect(hasTraversal('../etc/passwd')).toBe(true)
            expect(hasTraversal('src/../../secret.txt')).toBe(true)
            expect(hasTraversal('src/components/Button.tsx')).toBe(false)
        })
    })

    describe('Whitelist Extraction from PR Metadata', () => {
        it('extracts JSON comment whitelists', () => {
            const body = `
### Task Summary
Patching kinetic verb.
<!-- file_whitelist: ["scenes/ep101.json", "data/lore.json"] -->
`
            const list = extractWhitelist(body)
            expect(list).toEqual(['scenes/ep101.json', 'data/lore.json'])
        })

        it('extracts Markdown list whitelists', () => {
            const body = `
## Whitelist
* \`scenes/ep101.json\`
* \`data/lore.json\`
`
            const list = extractWhitelist(body)
            expect(list).toEqual(['scenes/ep101.json', 'data/lore.json'])
        })
    })

    describe('auditPullRequest Execution', () => {
        it('passes when changed files are allowlisted and outside protected set', async () => {
            const mockFiles: GitHubPullRequestFile[] = [
                {
                    filename: 'scenes/ep101_sc03.json',
                    status: 'modified',
                    additions: 2,
                    deletions: 2,
                    changes: 4,
                },
            ]

            globalThis.fetch = vi.fn().mockImplementation((url: string) => {
                if (url.includes('/files?per_page=100')) {
                    return Promise.resolve({
                        ok: true,
                        json: async () => mockFiles,
                    })
                }
                if (url.includes('/statuses/')) {
                    return Promise.resolve({
                        ok: true,
                        json: async () => ({}),
                    })
                }
                return Promise.reject(new Error(`Unexpected url: ${url}`))
            })

            const body = '<!-- file_whitelist: ["scenes/ep101_sc03.json"] -->'
            const result = await auditPullRequest(
                'camp-candor',
                '000.repo-bot',
                42,
                'sha12345',
                body,
                mockEnv,
            )

            expect(result.passed).toBe(true)
            expect(result.violations).toHaveLength(0)
            expect(globalThis.fetch).toHaveBeenCalledWith(
                expect.stringContaining('/statuses/sha12345'),
                expect.objectContaining({
                    method: 'POST',
                    body: expect.stringContaining('"state":"success"'),
                }),
            )
        })

        it('fails immediately when an agent attempts to mutate a test file', async () => {
            const mockFiles: GitHubPullRequestFile[] = [
                {
                    filename: 'scenes/ep101_sc03.json',
                    status: 'modified',
                    additions: 2,
                    deletions: 2,
                    changes: 4,
                },
                {
                    filename: 'tests/invariants.test.ts',
                    status: 'modified',
                    additions: 1,
                    deletions: 5,
                    changes: 6,
                },
            ]

            globalThis.fetch = vi.fn().mockImplementation((url: string) => {
                if (url.includes('/files?per_page=100')) {
                    return Promise.resolve({
                        ok: true,
                        json: async () => mockFiles,
                    })
                }
                if (url.includes('/statuses/')) {
                    return Promise.resolve({
                        ok: true,
                        json: async () => ({}),
                    })
                }
                return Promise.reject(new Error(`Unexpected url: ${url}`))
            })

            const body =
                '<!-- file_whitelist: ["scenes/ep101_sc03.json", "tests/invariants.test.ts"] -->'
            const result = await auditPullRequest(
                'camp-candor',
                '000.repo-bot',
                42,
                'sha_attack',
                body,
                mockEnv,
            )

            expect(result.passed).toBe(false)
            expect(
                result.violations.some((v) =>
                    v.includes('Mutating protected asset'),
                ),
            ).toBe(true)
            expect(globalThis.fetch).toHaveBeenCalledWith(
                expect.stringContaining('/statuses/sha_attack'),
                expect.objectContaining({
                    method: 'POST',
                    body: expect.stringContaining('"state":"failure"'),
                }),
            )
        })

        it('detects rename evasion where an origin file was protected', async () => {
            const mockFiles: GitHubPullRequestFile[] = [
                {
                    filename: 'scratch/hacked_test.ts',
                    previous_filename: 'tests/important.test.ts',
                    status: 'renamed',
                    additions: 0,
                    deletions: 0,
                    changes: 0,
                },
            ]

            globalThis.fetch = vi.fn().mockImplementation((url: string) => {
                if (url.includes('/files?per_page=100')) {
                    return Promise.resolve({
                        ok: true,
                        json: async () => mockFiles,
                    })
                }
                if (url.includes('/statuses/')) {
                    return Promise.resolve({
                        ok: true,
                        json: async () => ({}),
                    })
                }
                return Promise.reject(new Error(`Unexpected url: ${url}`))
            })

            const result = await auditPullRequest(
                'camp-candor',
                '000.repo-bot',
                42,
                'sha_rename',
                '',
                mockEnv,
            )

            expect(result.passed).toBe(false)
            expect(
                result.violations.some((v) =>
                    v.includes('Renaming or moving protected asset'),
                ),
            ).toBe(true)
        })

        it('fails closed when file count exceeds blast radius threshold', async () => {
            const mockFiles = Array.from({ length: 51 }, (_, i) => ({
                filename: `scenes/file_${i}.json`,
                status: 'modified',
                additions: 1,
                deletions: 1,
                changes: 2,
            })) as GitHubPullRequestFile[]

            globalThis.fetch = vi.fn().mockImplementation((url: string) => {
                if (url.includes('/files?per_page=100')) {
                    return Promise.resolve({
                        ok: true,
                        json: async () => mockFiles,
                    })
                }
                if (url.includes('/statuses/')) {
                    return Promise.resolve({
                        ok: true,
                        json: async () => ({}),
                    })
                }
                return Promise.reject(new Error(`Unexpected url: ${url}`))
            })

            const result = await auditPullRequest(
                'camp-candor',
                '000.repo-bot',
                42,
                'sha_blast',
                null,
                mockEnv,
            )

            expect(result.passed).toBe(false)
            expect(
                result.violations.some((v) =>
                    v.includes('Blast-radius ceiling breached'),
                ),
            ).toBe(true)
        })
    })
})
