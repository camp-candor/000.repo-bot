import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
    getGatewaySlug,
    getGatewayToken,
    inspectRepoChecksViaAiGateway,
    type Env,
} from '../../src/tools.js'

describe('AI Gateway Helpers & Routing (apps/worker)', () => {
    const originalFetch = globalThis.fetch

    beforeEach(() => {
        vi.restoreAllMocks()
    })

    afterEach(() => {
        globalThis.fetch = originalFetch
    })

    describe('getGatewaySlug', () => {
        it('returns default when AI_GATEWAY is empty or undefined', () => {
            expect(getGatewaySlug({} as any)).toBe('default')
        })

        it('returns custom gateway slug when provided', () => {
            expect(
                getGatewaySlug({
                    CLOUDFLARE_AI_GATEWAY: 'my-custom-gw',
                } as any),
            ).toBe('my-custom-gw')
        })

        it('returns default if AI_GATEWAY was accidentally set to a cfut_ token', () => {
            expect(
                getGatewaySlug({ CLOUDFLARE_AI_GATEWAY: 'cfut_12345' } as any),
            ).toBe('default')
        })
    })

    describe('getGatewayToken', () => {
        it('prefers CLOUDFLARE_AI_GATEWAY_TOKEN if present', () => {
            expect(
                getGatewayToken({
                    CLOUDFLARE_AI_GATEWAY_TOKEN: 'token_a',
                    CLOUDFLARE_API_TOKEN: 'token_b',
                } as any),
            ).toBe('token_a')
        })

        it('extracts token from CLOUDFLARE_AI_GATEWAY if prefixed with cfut_', () => {
            expect(
                getGatewayToken({
                    CLOUDFLARE_AI_GATEWAY: 'cfut_token_123',
                    CLOUDFLARE_API_TOKEN: 'fallback_token',
                } as any),
            ).toBe('cfut_token_123')
        })

        it('falls back to CLOUDFLARE_API_TOKEN', () => {
            expect(
                getGatewayToken({
                    CLOUDFLARE_AI_GATEWAY: 'default',
                    CLOUDFLARE_API_TOKEN: 'api_token_xyz',
                } as any),
            ).toBe('api_token_xyz')
        })
    })

    describe('inspectRepoChecksViaAiGateway', () => {
        it('queries GitHub and calls Cloudflare AI Gateway chat completions', async () => {
            const mockEnv = {
                CLOUDFLARE_ACCOUNT_ID: 'acc123',
                CLOUDFLARE_AI_GATEWAY: 'default',
                CLOUDFLARE_AI_GATEWAY_TOKEN: 'cfut_test',
                GITHUB_TOKEN: 'ghp_test',
            } as Env

            const mockCommit = {
                sha: 'commit_sha_123',
                commit: {
                    message: 'feat: test repobot gateway',
                    author: {
                        name: 'Test Author',
                        date: '2026-09-21T21:00:00Z',
                    },
                },
            }

            const mockCheckRuns = {
                total_count: 1,
                check_runs: [
                    {
                        name: 'vitest',
                        status: 'completed',
                        conclusion: 'success',
                        details_url: 'https://ci/vitest',
                    },
                ],
            }

            const aiPayload = {
                commit: {
                    sha: 'commit_sha_123',
                    message: 'feat: test repobot gateway',
                    author: 'Test Author',
                    timestamp: '2026-09-21T21:00:00Z',
                },
                checks: {
                    all_passed: true,
                    total_count: 1,
                    status: 'completed',
                    runs: [
                        {
                            name: 'vitest',
                            status: 'completed',
                            conclusion: 'success',
                            details_url: 'https://ci/vitest',
                        },
                    ],
                },
            }

            globalThis.fetch = vi
                .fn()
                .mockImplementation((url: string, opts?: any) => {
                    if (url.includes('/commits?per_page=1')) {
                        return Promise.resolve({
                            ok: true,
                            json: async () => [mockCommit],
                        })
                    }
                    if (url.includes('/check-runs')) {
                        return Promise.resolve({
                            ok: true,
                            json: async () => mockCheckRuns,
                        })
                    }
                    if (url.includes('gateway.ai.cloudflare.com')) {
                        expect(opts.headers.Authorization).toBe(
                            'Bearer cfut_test',
                        )
                        return Promise.resolve({
                            ok: true,
                            json: async () => ({
                                choices: [
                                    {
                                        message: {
                                            content: JSON.stringify(aiPayload),
                                        },
                                    },
                                ],
                            }),
                        })
                    }
                    return Promise.reject(new Error(`Unexpected url: ${url}`))
                })

            const result = await inspectRepoChecksViaAiGateway(
                'camp-candor',
                '000.repo-bot',
                mockEnv,
            )

            expect(result).toEqual(aiPayload)
            expect(globalThis.fetch).toHaveBeenCalledWith(
                'https://gateway.ai.cloudflare.com/v1/acc123/default/workers-ai/v1/chat/completions',
                expect.objectContaining({
                    method: 'POST',
                }),
            )
        })
    })
})
