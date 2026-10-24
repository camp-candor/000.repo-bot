// apps/worker/test/unit/rollback.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { executeSagaRollback } from '../../src/rollbackEngine.js'
import type { Env } from '../../src/tools.core.js'

describe('Watchdog Circuit Breaker & 4-Stage Compensating Saga Rollback (apps/worker)', () => {
    const mockEnv = {
        CLOUDFLARE_ACCOUNT_ID: 'acc_test',
        CLOUDFLARE_API_TOKEN: 'cf_test_token',
        CLOUDFLARE_AI_GATEWAY: 'default',
        GITHUB_TOKEN: 'ghp_mock_token_123',
        AI: {},
        AGENT_SESSION: {} as any,
    } as Env

    const originalFetch = globalThis.fetch

    beforeEach(() => {
        vi.restoreAllMocks()
    })

    afterEach(() => {
        globalThis.fetch = originalFetch
    })

    it('executes full 4-stage compensating teardown', async () => {
        const calls: string[] = []

        globalThis.fetch = vi
            .fn()
            .mockImplementation((url: string, opts?: any) => {
                calls.push(`${opts?.method || 'GET'} ${url}`)
                if (url.includes('/pulls/42')) {
                    return Promise.resolve({
                        ok: true,
                        status: 200,
                        json: async () => ({ number: 42, state: 'closed' }),
                    })
                }
                if (url.includes('/issues/42/comments')) {
                    return Promise.resolve({
                        ok: true,
                        status: 201,
                        json: async () => ({ id: 101, body: 'tombstone' }),
                    })
                }
                if (url.includes('/git/refs/heads/spec/TASK-01-abc1234')) {
                    return Promise.resolve({
                        ok: true,
                        status: 204,
                        json: async () => ({}),
                    })
                }
                return Promise.reject(new Error(`Unexpected url: ${url}`))
            })

        const receipt = await executeSagaRollback({
            owner: 'camp-candor',
            repo: '000.repo-bot',
            branchName: 'spec/TASK-01-abc1234',
            prNumber: 42,
            reason: 'CI quality gauntlet exhausted after 3 attempts',
            env: mockEnv,
        })

        expect(receipt.status).toBe('ROLLBACK_COMPLETED')
        expect(receipt.prClosed).toBe(true)
        expect(receipt.branchDeleted).toBe(true)
        expect(receipt.details.stage1.status).toBe('FAILED_ABORTED')
        expect(receipt.details.stage2.status).toBe('SUCCESS')
        expect(receipt.details.stage3.status).toBe('SUCCESS')
        expect(receipt.details.stage4.status).toBe('S_CLEAN_PINNED')

        expect(
            calls.some((c) => c.startsWith('PATCH') && c.includes('/pulls/42')),
        ).toBe(true)
        expect(
            calls.some((c) => c.startsWith('POST') && c.includes('/comments')),
        ).toBe(true)
        expect(
            calls.some(
                (c) =>
                    c.startsWith('DELETE') &&
                    c.includes('/spec/TASK-01-abc1234'),
            ),
        ).toBe(true)
    })

    it('rejects attempt to delete protected branch', async () => {
        await expect(
            executeSagaRollback({
                owner: 'camp-candor',
                repo: '000.repo-bot',
                branchName: 'main',
                reason: 'unauthorized attempt',
                env: mockEnv,
            }),
        ).rejects.toThrow(
            /SECURITY_BREACH: Refusal to delete protected\/non-spec branch: main/,
        )

        await expect(
            executeSagaRollback({
                owner: 'camp-candor',
                repo: '000.repo-bot',
                branchName: 'refs/heads/master',
                reason: 'unauthorized attempt',
                env: mockEnv,
            }),
        ).rejects.toThrow(
            /SECURITY_BREACH: Refusal to delete protected\/non-spec branch: master/,
        )
    })

    it('absorbs already-deleted 404 branch cleanly', async () => {
        globalThis.fetch = vi.fn().mockImplementation((url: string) => {
            if (url.includes('/git/refs/heads/spec/TASK-02-deadbeef')) {
                return Promise.resolve({
                    ok: false,
                    status: 404,
                    json: async () => ({ message: 'Reference does not exist' }),
                })
            }
            return Promise.reject(new Error(`Unexpected url: ${url}`))
        })

        const receipt = await executeSagaRollback({
            owner: 'camp-candor',
            repo: '000.repo-bot',
            branchName: 'spec/TASK-02-deadbeef',
            reason: 'Branch already cleaned up by upstream',
            env: mockEnv,
        })

        expect(receipt.status).toBe('ROLLBACK_COMPLETED')
        expect(receipt.branchDeleted).toBe(true)
        expect(receipt.details.stage3.status).toBe('ABSORBED')
    })

    it('absorbs already-closed 422 pull request cleanly', async () => {
        globalThis.fetch = vi.fn().mockImplementation((url: string) => {
            if (url.includes('/pulls/99')) {
                return Promise.resolve({
                    ok: false,
                    status: 422,
                    json: async () => ({
                        message: 'Pull request is already closed',
                    }),
                })
            }
            return Promise.reject(new Error(`Unexpected url: ${url}`))
        })

        const receipt = await executeSagaRollback({
            owner: 'camp-candor',
            repo: '000.repo-bot',
            branchName: '',
            prNumber: 99,
            reason: 'PR was manually closed earlier',
            env: mockEnv,
        })

        expect(receipt.status).toBe('ROLLBACK_COMPLETED')
        expect(receipt.prClosed).toBe(true)
        expect(receipt.details.stage2.status).toBe('ABSORBED')
    })
})
