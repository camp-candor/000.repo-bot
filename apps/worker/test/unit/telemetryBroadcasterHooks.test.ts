import { describe, it, expect, vi } from 'vitest'
import { emitEdgeTelemetry } from '../../src/RepoBotDO.js'
import { appendAuditEvent } from '../../src/audit/auditLedger.js'

describe('Telemetry Broadcaster Hooks Across Subsystems', () => {
    it('emitEdgeTelemetry invokes stub.broadcastTelemetry cleanly', async () => {
        const mockBroadcast = vi.fn().mockResolvedValue(undefined)
        const mockStub = {
            broadcastTelemetry: mockBroadcast,
            fetch: vi.fn(),
        }

        const mockEnv = {
            REPO_BOT_DO: {
                idFromName: vi.fn().mockReturnValue('global-id'),
                get: vi.fn().mockReturnValue(mockStub),
            },
        }

        await emitEdgeTelemetry(
            mockEnv,
            'AUDIT_LOG',
            'testAudit',
            { seq: 42 },
            '>> [AUDIT #42] PR_MERGED',
        )

        expect(mockEnv.REPO_BOT_DO.idFromName).toHaveBeenCalledWith('global')
        expect(mockBroadcast).toHaveBeenCalledWith(
            'AUDIT_LOG',
            'testAudit',
            { seq: 42 },
            '>> [AUDIT #42] PR_MERGED',
        )
    })

    it('emitEdgeTelemetry falls back to internal HTTP POST when RPC is absent', async () => {
        const mockFetch = vi.fn().mockResolvedValue(new Response('{"ok":true}'))
        const mockStub = {
            fetch: mockFetch,
        }

        const mockEnv = {
            REPO_BOT_DO: {
                idFromName: vi.fn().mockReturnValue('global-id'),
                get: vi.fn().mockReturnValue(mockStub),
            },
        }

        await emitEdgeTelemetry(
            mockEnv,
            'JULES_EVENT',
            'testJules',
            { sessionId: 'abc' },
            '>> [JULES] Session active',
        )

        expect(mockFetch).toHaveBeenCalled()
        const req = mockFetch.mock.calls[0][0] as Request
        expect(req.url).toContain('/broadcast')
        expect(req.method).toBe('POST')
    })

    it('emitEdgeTelemetry catches errors safely without throwing', async () => {
        const mockEnv = {
            REPO_BOT_DO: {
                idFromName: vi.fn().mockImplementation(() => {
                    throw new Error('DO connection failed')
                }),
                get: vi.fn(),
            },
        }

        await expect(
            emitEdgeTelemetry(mockEnv, 'PR_EVENT', 'test', {}, '>> [TEST]'),
        ).resolves.not.toThrow()
    })

    it('appendAuditEvent emits AUDIT_LOG telemetry packet when env is passed', async () => {
        const mockBroadcast = vi.fn().mockResolvedValue(undefined)
        const mockEnv = {
            REPO_BOT_DO: {
                idFromName: vi.fn().mockReturnValue('global-id'),
                get: vi
                    .fn()
                    .mockReturnValue({ broadcastTelemetry: mockBroadcast }),
            },
        }

        const mockDb = {
            exec: vi.fn().mockResolvedValue(undefined),
            prepare: vi.fn().mockReturnValue({
                bind: vi.fn().mockReturnThis(),
                first: vi.fn().mockResolvedValue(null),
                run: vi.fn().mockResolvedValue({ success: true }),
            }),
        }

        const eventInput = {
            taskId: 'TASK-99',
            repository: 'camp-candor/000.repo-bot',
            eventType: 'PR_OPENED',
            actorId: 'test-user',
            headSha: '0123456789abcdef0123456789abcdef01234567',
            payload: { title: 'Test PR' },
        }

        await appendAuditEvent(mockDb, eventInput, mockEnv)

        expect(mockBroadcast).toHaveBeenCalled()
        const callArgs = mockBroadcast.mock.calls[0]
        expect(callArgs[0]).toBe('AUDIT_LOG')
        expect(callArgs[1]).toBe('auditLedger')
        expect(callArgs[3]).toContain(
            '>> [AUDIT #1] PR_OPENED on camp-candor/000.repo-bot',
        )
    })
})
