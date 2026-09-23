import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
    normalizePath,
    hasTraversal,
    isProtectedPath,
    checkForkIsolation,
    auditPullRequest,
} from '../../src/prAuditEngine.js'
import * as tools from '../../src/tools.js'

describe('FEAT-01: Zero-Trust PR Scope Firewall & Diff Auditor', () => {
    const mockEnv: tools.Env = {
        CLOUDFLARE_ACCOUNT_ID: 'test-acc',
        CLOUDFLARE_API_TOKEN: 'test-token',
        CLOUDFLARE_AI_GATEWAY: 'test-gw',
        GITHUB_TOKEN: 'test-gh-token',
        GITHUB_WEBHOOK_SECRET: 'super-secret',
        AI: {} as any,
        REPO_BOT_DO: {} as any,
    }

    beforeEach(() => {
        vi.restoreAllMocks()
    })

    describe('1. Path Normalization & Traversal Defense', () => {
        it('normalizes mixed Windows and POSIX separators', () => {
            expect(normalizePath('src\\components\\button.tsx')).toBe(
                'src/components/button.tsx',
            )
            expect(normalizePath('/src/scenes/sc01.json')).toBe(
                'src/scenes/sc01.json',
            )
        })

        it('detects directory traversal sequences', () => {
            expect(hasTraversal('src/../.github/workflows/ci.yml')).toBe(true)
            expect(hasTraversal('./package.json')).toBe(true)
            expect(hasTraversal('src/components/button.tsx')).toBe(false)
        })
    })

    describe('2. Protected Path Anchored Regex Matrix', () => {
        it('blocks protected assets and allows safe names', () => {
            expect(isProtectedPath('.github/workflows/deploy.yml')).toBe(true)
            expect(isProtectedPath('tests/invariants.test.ts')).toBe(true)
            expect(isProtectedPath('src/utils/math.test.ts')).toBe(true)
            expect(isProtectedPath('package.json')).toBe(true)
            expect(isProtectedPath('pnpm-lock.yaml')).toBe(true)
            expect(isProtectedPath('tsconfig.json')).toBe(true)
            expect(isProtectedPath('Dockerfile')).toBe(true)
            expect(isProtectedPath('wrangler.jsonc')).toBe(true)
            expect(isProtectedPath('.husky/pre-commit')).toBe(true)
            expect(isProtectedPath('CODEOWNERS')).toBe(true)
            expect(isProtectedPath('benchmarks/golden_set/baseline.png')).toBe(
                true,
            )

            // False positive resistance: innocent names must pass
            expect(isProtectedPath('src/utils/contest.md')).toBe(false)
            expect(isProtectedPath('src/views/eslintHelpers.ts')).toBe(false)
            expect(isProtectedPath('src/scenes/scene_testament.json')).toBe(
                false,
            )
        })
    })

    describe('3. Fork Isolation Check', () => {
        it('allows internal branches and rejects external forks', () => {
            const internalPayload = {
                pull_request: {
                    head: { repo: { full_name: 'camp-candor/000.repo-bot' } },
                },
                repository: { full_name: 'camp-candor/000.repo-bot' },
            }
            expect(checkForkIsolation(internalPayload)).toBe(true)

            const externalForkPayload = {
                pull_request: {
                    head: { repo: { full_name: 'attacker/000.repo-bot' } },
                },
                repository: { full_name: 'camp-candor/000.repo-bot' },
            }
            expect(checkForkIsolation(externalForkPayload)).toBe(false)
        })
    })

    describe('4. The 10-Vector Planted Adversarial PR Battery (100% Recall)', () => {
        const baseSha = '1111111111111111111111111111111111111111'
        const headSha = '2222222222222222222222222222222222222222'
        const prBodyWithWhitelist =
            '<!-- file_whitelist: ["src/scenes/sc01.json", "src/types/scene.ts"] -->'

        function mockGitHubAuditResponses(
            files: any[],
            lineageStatus = 'ahead',
        ) {
            vi.spyOn(tools, 'githubRequest').mockImplementation(
                async (endpoint: string) => {
                    if (endpoint.includes('/compare/')) {
                        return { status: lineageStatus }
                    }
                    if (endpoint.includes('/pulls/101/files')) {
                        return files
                    }
                    if (endpoint.includes('/statuses/')) {
                        return { state: 'recorded' }
                    }
                    return {}
                },
            )
        }

        it('Attack Vector 1: Direct Test Tampering (tests/invariants.test.ts)', async () => {
            mockGitHubAuditResponses([
                {
                    filename: 'tests/invariants.test.ts',
                    status: 'modified',
                    additions: 1,
                    deletions: 5,
                    changes: 6,
                },
            ])

            const result = await auditPullRequest(
                'camp-candor',
                'repo',
                101,
                headSha,
                baseSha,
                prBodyWithWhitelist,
                mockEnv,
            )
            expect(result.passed).toBe(false)
            expect(result.violations[0]).toContain(
                'Mutating protected asset is forbidden: tests/invariants.test.ts',
            )
        })

        it('Attack Vector 2: Nested Test Addition (*.test.tsx)', async () => {
            mockGitHubAuditResponses([
                {
                    filename: 'src/components/button.test.tsx',
                    status: 'added',
                    additions: 10,
                    deletions: 0,
                    changes: 10,
                },
            ])

            const result = await auditPullRequest(
                'camp-candor',
                'repo',
                101,
                headSha,
                baseSha,
                prBodyWithWhitelist,
                mockEnv,
            )
            expect(result.passed).toBe(false)
            expect(result.violations[0]).toContain(
                'Mutating protected asset is forbidden: src/components/button.test.tsx',
            )
        })

        it('Attack Vector 3: Rename Traversal Evasion (git mv out of protected folder)', async () => {
            mockGitHubAuditResponses([
                {
                    filename: 'src/scratch/temp.ts',
                    previous_filename: 'tests/invariants.test.ts',
                    status: 'renamed',
                    additions: 0,
                    deletions: 0,
                    changes: 0,
                },
            ])

            const result = await auditPullRequest(
                'camp-candor',
                'repo',
                101,
                headSha,
                baseSha,
                prBodyWithWhitelist,
                mockEnv,
            )
            expect(result.passed).toBe(false)
            expect(
                result.violations.some((v) =>
                    v.includes(
                        'Renaming or moving protected asset is forbidden: tests/invariants.test.ts',
                    ),
                ),
            ).toBe(true)
        })

        it('Attack Vector 4: Path Traversal Injection (../)', async () => {
            mockGitHubAuditResponses([
                {
                    filename: 'src/../../.github/workflows/ci.yml',
                    status: 'modified',
                    additions: 1,
                    deletions: 1,
                    changes: 2,
                },
            ])

            const result = await auditPullRequest(
                'camp-candor',
                'repo',
                101,
                headSha,
                baseSha,
                prBodyWithWhitelist,
                mockEnv,
            )
            expect(result.passed).toBe(false)
            expect(
                result.violations.some((v) =>
                    v.includes('Directory traversal attempt detected'),
                ),
            ).toBe(true)
        })

        it('Attack Vector 5: CI/CD Workflow Alteration (.github/workflows/)', async () => {
            mockGitHubAuditResponses([
                {
                    filename: '.github/workflows/deploy.yml',
                    status: 'modified',
                    additions: 2,
                    deletions: 1,
                    changes: 3,
                },
            ])

            const result = await auditPullRequest(
                'camp-candor',
                'repo',
                101,
                headSha,
                baseSha,
                prBodyWithWhitelist,
                mockEnv,
            )
            expect(result.passed).toBe(false)
            expect(result.violations[0]).toContain(
                'Mutating protected asset is forbidden: .github/workflows/deploy.yml',
            )
        })

        it('Attack Vector 6: Manifest Poisoning (package.json / lockfiles)', async () => {
            mockGitHubAuditResponses([
                {
                    filename: 'package.json',
                    status: 'modified',
                    additions: 1,
                    deletions: 0,
                    changes: 1,
                },
            ])

            const result = await auditPullRequest(
                'camp-candor',
                'repo',
                101,
                headSha,
                baseSha,
                prBodyWithWhitelist,
                mockEnv,
            )
            expect(result.passed).toBe(false)
            expect(result.violations[0]).toContain(
                'Mutating protected asset is forbidden: package.json',
            )
        })

        it('Attack Vector 7: TypeScript Config Loosening (tsconfig.json)', async () => {
            mockGitHubAuditResponses([
                {
                    filename: 'tsconfig.json',
                    status: 'modified',
                    additions: 1,
                    deletions: 1,
                    changes: 2,
                },
            ])

            const result = await auditPullRequest(
                'camp-candor',
                'repo',
                101,
                headSha,
                baseSha,
                prBodyWithWhitelist,
                mockEnv,
            )
            expect(result.passed).toBe(false)
            expect(result.violations[0]).toContain(
                'Mutating protected asset is forbidden: tsconfig.json',
            )
        })

        it('Attack Vector 8: Blast-Radius Ceiling Overage (>50 files)', async () => {
            const excessFiles = Array.from({ length: 51 }, (_, i) => ({
                filename: `src/scenes/file_${i}.json`,
                status: 'modified',
                additions: 1,
                deletions: 0,
                changes: 1,
            }))
            mockGitHubAuditResponses(excessFiles)

            const result = await auditPullRequest(
                'camp-candor',
                'repo',
                101,
                headSha,
                baseSha,
                null,
                mockEnv,
            )
            expect(result.passed).toBe(false)
            expect(
                result.violations.some((v) =>
                    v.includes(
                        'Blast-radius ceiling breached: 51 files changed',
                    ),
                ),
            ).toBe(true)
        })

        it('Attack Vector 9: Spec Allowlist Escape (Modifying unlisted file)', async () => {
            mockGitHubAuditResponses([
                {
                    filename: 'src/scenes/sc01.json',
                    status: 'modified',
                    additions: 1,
                    deletions: 0,
                    changes: 1,
                },
                {
                    filename: 'src/auth/keys.ts',
                    status: 'modified',
                    additions: 5,
                    deletions: 0,
                    changes: 5,
                },
            ])

            const result = await auditPullRequest(
                'camp-candor',
                'repo',
                101,
                headSha,
                baseSha,
                prBodyWithWhitelist,
                mockEnv,
            )
            expect(result.passed).toBe(false)
            expect(
                result.violations.some((v) =>
                    v.includes(
                        'File is outside declared task whitelist: src/auth/keys.ts',
                    ),
                ),
            ).toBe(true)
        })

        it('Attack Vector 10: Lineage Mutation / Force-Push (status: diverged)', async () => {
            mockGitHubAuditResponses(
                [
                    {
                        filename: 'src/scenes/sc01.json',
                        status: 'modified',
                        additions: 1,
                        deletions: 0,
                        changes: 1,
                    },
                ],
                'diverged',
            )

            const result = await auditPullRequest(
                'camp-candor',
                'repo',
                101,
                headSha,
                baseSha,
                prBodyWithWhitelist,
                mockEnv,
            )
            expect(result.passed).toBe(false)
            expect(result.lineageValid).toBe(false)
            expect(
                result.violations.some((v) =>
                    v.includes(
                        "Branch lineage failure: commit status is 'diverged'",
                    ),
                ),
            ).toBe(true)
        })

        it('Positive Control: Valid bounded PR passes all gates', async () => {
            mockGitHubAuditResponses(
                [
                    {
                        filename: 'src/scenes/sc01.json',
                        status: 'modified',
                        additions: 3,
                        deletions: 1,
                        changes: 4,
                    },
                    {
                        filename: 'src/types/scene.ts',
                        status: 'modified',
                        additions: 2,
                        deletions: 0,
                        changes: 2,
                    },
                ],
                'ahead',
            )

            const result = await auditPullRequest(
                'camp-candor',
                'repo',
                101,
                headSha,
                baseSha,
                prBodyWithWhitelist,
                mockEnv,
            )
            expect(result.passed).toBe(true)
            expect(result.violations.length).toBe(0)
            expect(result.lineageValid).toBe(true)
            expect(result.description).toContain(
                'Scope verified: 2 file(s) within allowlist',
            )
        })
    })
})
