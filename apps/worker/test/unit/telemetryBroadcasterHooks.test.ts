import { describe, it, expect, vi } from 'vitest'
import { emitEdgeTelemetry } from '../../src/RepoBotDO.js'
import { appendAuditEvent } from '../../src/audit/auditLedger.js'

describe('Telemetry Broadcaster Hooks', () => {
    it('emitEdgeTelemetry calls stub.broadcastTelemetry when available', async () => {
        const mockStub = {
            broadcastTelemetry: vi.fn().mockResolvedValue(undefined),
        }
        const mockEnv = {
            REPO_BOT_DO: {
                idFromName: vi.fn().mockReturnValue('mock-id'),
                get: vi.fn().mockReturnValue(mockStub),
            },
        }

        await emitEdgeTelemetry(
            mockEnv,
            'TEST_TYPE',
            'test_source',
            {},
            'ascii',
        )
        expect(mockStub.broadcastTelemetry).toHaveBeenCalledWith(
            'TEST_TYPE',
            'test_source',
            {},
            'ascii',
        )
    })

    it('emitEdgeTelemetry falls back to POST /broadcast when RPC is absent', async () => {
        const mockStub = {
            fetch: vi
                .fn()
                .mockResolvedValue(new Response(JSON.stringify({ ok: true }))),
        }
        const mockEnv = {
            REPO_BOT_DO: {
                idFromName: vi.fn().mockReturnValue('mock-id'),
                get: vi.fn().mockReturnValue(mockStub),
            },
        }

        await emitEdgeTelemetry(
            mockEnv,
            'TEST_TYPE',
            'test_source',
            {},
            'ascii',
        )
        expect(mockStub.fetch).toHaveBeenCalled()
    })

    it('emitEdgeTelemetry catches errors safely without throwing', async () => {
        const mockStub = {
            broadcastTelemetry: vi
                .fn()
                .mockRejectedValue(new Error('rpc failed')),
        }
        const mockEnv = {
            REPO_BOT_DO: {
                idFromName: vi.fn().mockReturnValue('mock-id'),
                get: vi.fn().mockReturnValue(mockStub),
            },
        }
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        await expect(
            emitEdgeTelemetry(mockEnv, 'TEST_TYPE', 'test_source', {}, 'ascii'),
        ).resolves.not.toThrow()
        expect(warnSpy).toHaveBeenCalledWith(
            '[TELEMETRY_EMIT_WARN]',
            'rpc failed',
        )
        warnSpy.mockRestore()
    })

    it('appendAuditEvent emits AUDIT_LOG packet when env is passed', async () => {
        const mockDb = {
            prepare: vi.fn().mockReturnValue({
                bind: vi.fn().mockReturnThis(),
                first: vi.fn().mockResolvedValue(null),
                run: vi.fn().mockResolvedValue({ success: true }),
            }),
            exec: vi.fn().mockResolvedValue(undefined),
        }

        const mockStub = {
            broadcastTelemetry: vi.fn().mockResolvedValue(undefined),
        }
        const mockEnv = {
            REPO_BOT_DO: {
                idFromName: vi.fn().mockReturnValue('mock-id'),
                get: vi.fn().mockReturnValue(mockStub),
            },
        }

        const event = {
            taskId: 'test',
            repository: 'test/repo',
            eventType: 'TEST_EVENT',
            actorId: 'test_user',
            headSha: '12345678',
            payload: {},
        }

        await appendAuditEvent(mockDb, event, mockEnv)

        // Wait a tick for the async catch to fire internally (since it's not awaited before return)
        await new Promise((resolve) => setTimeout(resolve, 10))

        expect(mockStub.broadcastTelemetry).toHaveBeenCalledWith(
            'AUDIT_LOG',
            'auditLedger',
            expect.objectContaining({ type: 'TEST_EVENT' }),
            expect.stringContaining('>> [AUDIT #'),
        )
    })
})
