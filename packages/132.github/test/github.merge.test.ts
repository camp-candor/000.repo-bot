import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
    fetchMergeCandidates,
    inspectPrCas,
    executeMerge,
} from '../00.github.unit/buz/github.buzz.js'
import { GithubModel } from '../00.github.unit/github.model.js'

describe('GitHub Terminal Deck: Fleet Merge Controller', () => {
    beforeEach(() => {
        vi.restoreAllMocks()
        ;(global as any).LIBRARY = { hunt: vi.fn().mockResolvedValue({}) }
    })

    it('fetches merge candidates list from edge worker', async () => {
        const model = new GithubModel()
        const slv = vi.fn()

        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({
                ok: true,
                candidates: [
                    {
                        taskId: 'TASK-01',
                        pullNumber: 42,
                        state: 'AWAITING_APPROVAL',
                    },
                ],
            }),
        }) as any

        await fetchMergeCandidates(model, { idx: 'fetch', slv }, {} as any)
        expect(slv).toHaveBeenCalled()
        const result = slv.mock.calls[0][0]
        expect(result.gthBit.lst.length).toBe(1)
        expect(result.gthBit.lst[0].taskId).toBe('TASK-01')
    })

    it('inspects PR CAS and verifies checksPassed and head drift', async () => {
        const model = new GithubModel()
        const slv = vi.fn()

        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({
                ok: true,
                taskId: 'TASK-01',
                state: 'AWAITING_APPROVAL',
                auditedHeadSha: 'c7f4901b8e42f9a0d8431e21b7782a1290f12c34',
                remoteHeadSha: 'c7f4901b8e42f9a0d8431e21b7782a1290f12c34',
                headDrift: false,
                checksPassed: true,
                branchName: 'spec/task-01',
            }),
        }) as any

        await inspectPrCas(
            model,
            { idx: 'inspect', src: 'TASK-01', slv },
            {} as any,
        )
        expect(slv).toHaveBeenCalled()
        const result = slv.mock.calls[0][0]
        expect(result.gthBit.val).toBe(1) // 1 indicates compatible & safe for merge
    })

    it('fails closed when PR has remote head drift', async () => {
        const model = new GithubModel()
        const slv = vi.fn()

        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({
                ok: true,
                taskId: 'TASK-01',
                auditedHeadSha: 'c7f4901b8e42f9a0d8431e21b7782a1290f12c34',
                remoteHeadSha: 'drifted00000000000000000000000000000000',
                headDrift: true,
                checksPassed: true,
            }),
        }) as any

        await inspectPrCas(
            model,
            { idx: 'inspect', src: 'TASK-01', slv },
            {} as any,
        )
        expect(slv).toHaveBeenCalled()
        const result = slv.mock.calls[0][0]
        expect(result.gthBit.val).toBe(0) // 0 indicates blocked / refused
    })

    it('executes merge trigger and parses transition receipt', async () => {
        const model = new GithubModel()
        const slv = vi.fn()

        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({
                action: 'STATE_TRANSITIONED',
                state: 'MERGED',
                context: {
                    mergeCommitSha: '9999888877776666555544443333222211110000',
                },
            }),
        }) as any

        await executeMerge(
            model,
            {
                idx: 'merge',
                src: 'TASK-01',
                dat: {
                    taskId: 'TASK-01',
                    headSha: 'c7f4901b8e42f9a0d8431e21b7782a1290f12c34',
                    pullNumber: 42,
                },
                slv,
            },
            {} as any,
        )

        expect(slv).toHaveBeenCalled()
        const result = slv.mock.calls[0][0]
        expect(result.gthBit.val).toBe(1)
    })
})
