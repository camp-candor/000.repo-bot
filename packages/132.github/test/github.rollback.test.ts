import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
    triggerTaskRollback,
    fetchRecentCommits,
    previewCommitDetails,
    executeHardReset,
} from '../00.github.unit/buz/github.buzz.js'
import { GithubModel } from '../00.github.unit/github.model.js'

vi.mock('node:child_process', () => ({
    exec: vi.fn(),
}))

import { exec } from 'node:child_process'

describe('GitHub Terminal Deck: Saga Rollback & Git Reset Flight Deck', () => {
    beforeEach(() => {
        vi.restoreAllMocks()
        ;(global as any).LIBRARY = { hunt: vi.fn().mockResolvedValue({}) }
    })

    it('triggerTaskRollback dispatches HUMAN_REJECTED transition to worker', async () => {
        const model = new GithubModel()
        const slv = vi.fn()

        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({
                action: 'STATE_TRANSITIONED',
                state: 'ROLLING_BACK',
            }),
        }) as any

        await triggerTaskRollback(
            model,
            {
                idx: 'rollback',
                src: 'TASK-01',
                dat: { taskId: 'TASK-01', reason: 'MANUAL_ABORT' },
                slv,
            },
            {} as any,
        )

        expect(slv).toHaveBeenCalled()
        const result = slv.mock.calls[0][0]
        expect(result.gthBit.val).toBe(1)
    })

    it('fetchRecentCommits parses git log output into structured choice list', async () => {
        const model = new GithubModel()
        const slv = vi.fn()

        const mockGitLog =
            '955d7c9\tfeat(worker): implement saga rollback\telliotbradly\t10 minutes ago\n' +
            '194a52a\tfeat(blessed): fleet merge controller\telliotbradly\t1 hour ago'

        ;(exec as any).mockImplementation((cmd: string, cb: any) => {
            cb(null, { stdout: mockGitLog, stderr: '' })
        })

        await fetchRecentCommits(
            model,
            { idx: 'fetch-commits', slv },
            {} as any,
        )

        expect(slv).toHaveBeenCalled()
        const result = slv.mock.calls[0][0]
        expect(result.gthBit.lst.length).toBe(2)
        expect(result.gthBit.lst[0].shortSha).toBe('955d7c9')
    })

    it('previewCommitDetails inspects full commit message and discarded commits', async () => {
        const model = new GithubModel()
        const slv = vi.fn()

        ;(exec as any).mockImplementation((cmd: string, cb: any) => {
            if (cmd.includes('git show')) {
                cb(null, {
                    stdout: 'Full SHA: 194a52a\nAuthor: dev\n\nTitle\nBody details',
                    stderr: '',
                })
            } else if (cmd.includes('git log --oneline')) {
                cb(null, { stdout: '955d7c9 discard this\n', stderr: '' })
            }
        })

        await previewCommitDetails(
            model,
            {
                idx: 'preview',
                src: '194a52a',
                dat: { shortSha: '194a52a' },
                slv,
            },
            {} as any,
        )

        expect(slv).toHaveBeenCalled()
        const result = slv.mock.calls[0][0]
        expect(result.gthBit.val).toBe(1)
        expect(result.gthBit.dat.discardedCount).toBe(1)
    })

    it('executeHardReset executes local reset and immediate force-with-lease push', async () => {
        const model = new GithubModel()
        const slv = vi.fn()

        ;(exec as any).mockImplementation((cmd: string, cb: any) => {
            if (cmd.includes('rev-parse')) {
                cb(null, { stdout: 'main\n', stderr: '' })
            } else if (cmd.includes('reset --hard')) {
                cb(null, { stdout: 'HEAD is now at 194a52a\n', stderr: '' })
            } else if (cmd.includes('push origin')) {
                cb(null, { stdout: 'Everything up-to-date\n', stderr: '' })
            }
        })

        await executeHardReset(
            model,
            { idx: 'reset', src: '194a52a', dat: { sha: '194a52a' }, slv },
            {} as any,
        )

        expect(slv).toHaveBeenCalled()
        const result = slv.mock.calls[0][0]
        expect(result.gthBit.val).toBe(1)
        expect(result.gthBit.dat.branch).toBe('main')
    })
})
