import { describe, it, expect, vi } from 'vitest'
import { RepoBotDO, recordSlackReceipt } from '../../src/RepoBotDO.js'
import { appendAuditEvent } from '../../src/audit/auditLedger.js'

function createRepoBotDO(ctx: any, env: any): RepoBotDO {
    const instance = Object.create(RepoBotDO.prototype)
    instance.ctx = ctx
    instance.env = env
    instance.telemetrySeq = 0
    return instance
}

describe('DAY-006: Active Edge Telemetry Broadcaster Hooks', () => {
    function createMockDOState() {
        const storageMap = new Map<string, any>()
        const sockets: any[] = []

        return {
            storage: {
                get: vi.fn(async (key: string) => storageMap.get(key) || null),
                put: vi.fn(async (key: string, val: any) => {
                    storageMap.set(key, val)
                }),
                delete: vi.fn(async (key: string) => {
                    storageMap.delete(key)
                }),
            },
            acceptWebSocket: vi.fn((ws: any, tags: string[]) => {
                ws.__tags = tags
                sockets.push(ws)
            }),
            getWebSockets: vi.fn((tag?: string) => {
                if (!tag) return sockets
                return sockets.filter((s) => s.__tags?.includes(tag))
            }),
            _storageMap: storageMap,
            _sockets: sockets,
        } as any
    }

    const mockStub = {
        broadcastTelemetry: vi.fn(async () => {}),
        fetch: vi.fn(async () => new Response('{"ok":true}')),
    }

    const mockEnv: any = {
        REPO_BOT_DO: {
            idFromName: vi.fn(() => ({ toString: () => 'global-id' })),
            get: vi.fn(() => mockStub),
        },
    }

    it('emits SLACK_RECEIPT telemetry and persists to storage', async () => {
        const ctx = createMockDOState()
        const doInstance = createRepoBotDO(ctx, mockEnv)
        const broadcastSpy = vi.spyOn(doInstance, 'broadcastTelemetry')

        const receipt = {
            timestamp: Date.now(),
            channel: 'C0C40FMRQ9H',
            event: 'merged',
            ok: true,
        }

        await recordSlackReceipt(ctx.storage, receipt, doInstance)

        expect(ctx.storage.put).toHaveBeenCalledWith(
            'last_slack_receipt',
            receipt,
        )
        expect(broadcastSpy).toHaveBeenCalledWith(
            'SLACK_RECEIPT',
            'RepoBotDO',
            receipt,
            expect.stringContaining(
                '>> [SLACK] Receipt recorded: merged on C0C40FMRQ9H [OK]',
            ),
        )
    })

    it('emits AUDIT_LOG telemetry through appendAuditEvent', async () => {
        const mockDb = {
            exec: vi.fn(),
            prepare: vi.fn(() => ({
                bind: vi.fn(() => ({
                    first: vi.fn(async () => null),
                    run: vi.fn(async () => ({})),
                })),
                first: vi.fn(async () => null),
            })),
        }

        mockStub.fetch.mockClear()

        await appendAuditEvent(
            mockDb,
            {
                taskId: 'TASK-100',
                repository: 'camp-candor/000.repo-bot',
                eventType: 'TEST_EVENT',
                actorId: 'operator',
                headSha: '1234567890abcdef1234567890abcdef12345678',
                payload: { test: true },
            },
            mockEnv,
        )

        await new Promise((resolve) => setTimeout(resolve, 20))

        expect(mockStub.fetch).toHaveBeenCalled()
        const req = (mockStub.fetch.mock.calls as any)[0][0] as Request
        expect(req.url).toContain('/broadcast')
        const bodyStr = await req.clone().text()
        const body = JSON.parse(bodyStr)
        expect(body.type).toBe('AUDIT_LOG')
        expect(body.source).toBe('auditLedger')
        expect(body.ascii).toContain('>> [AUDIT #')
    })

    it('broadcasts TASK_TRANSITION through RepoBotDO /fsm/transition handler', async () => {
        const ctx = createMockDOState()
        const doInstance = createRepoBotDO(ctx, mockEnv)
        const broadcastSpy = vi.spyOn(doInstance, 'broadcastTelemetry')

        const req = new Request('http://internal/fsm/transition', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                taskId: 'TASK-23.8',
                state: 'AWAITING_APPROVAL',
            }),
        })

        const res = await doInstance.fetch(req)
        expect(res.status).toBe(200)
        expect(broadcastSpy).toHaveBeenCalledWith(
            'TASK_TRANSITION',
            'RepoBotDO',
            { taskId: 'TASK-23.8', state: 'AWAITING_APPROVAL' },
            '>> [FSM] Task TASK-23.8 transitioned to AWAITING_APPROVAL',
        )
    })
})
