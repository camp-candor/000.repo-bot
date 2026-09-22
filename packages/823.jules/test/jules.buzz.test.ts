import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { JulesModel } from '../00.jules.unit/jules.model.js'
import {
    dispatchJulesTask,
    checkJulesStatus,
} from '../00.jules.unit/buz/jules.buzz.js'

describe('Jules Buzzer Unit Tests', () => {
    const originalFetch = globalThis.fetch

    beforeEach(() => {
        vi.restoreAllMocks()
    })

    afterEach(() => {
        globalThis.fetch = originalFetch
    })

    it('dispatches task to local control plane endpoint', async () => {
        const mockModel = new JulesModel()
        const slv = vi.fn()
        const mockResponse = {
            action: 'JULES_DISPATCHED',
            sessionId: 'sess_123',
            branch: 'spec/task-01-c7f4901',
        }

        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => mockResponse,
        } as any)

        await dispatchJulesTask(
            mockModel,
            {
                idx: 'test-dispatch',
                src: 'Run audit',
                dat: { taskId: 'TASK-01' },
                slv,
            },
            {} as any,
        )

        expect(slv).toHaveBeenCalledWith({
            jlsBit: {
                idx: 'dispatch-jules-task',
                dat: mockResponse,
            },
        })
        expect(mockModel.lastDispatchedSessionId).toBe('sess_123')
    })

    it('queries session status for active session ID', async () => {
        const mockModel = new JulesModel()
        mockModel.lastDispatchedSessionId = 'sess_456'
        const slv = vi.fn()
        const mockStatusResponse = {
            sessionId: 'sess_456',
            status: 'IN_PROGRESS',
        }

        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => mockStatusResponse,
        } as any)

        await checkJulesStatus(
            mockModel,
            {
                idx: 'sess_456',
                slv,
            },
            {} as any,
        )

        expect(slv).toHaveBeenCalledWith({
            jlsBit: {
                idx: 'check-jules-status',
                dat: mockStatusResponse,
            },
        })
    })
})
