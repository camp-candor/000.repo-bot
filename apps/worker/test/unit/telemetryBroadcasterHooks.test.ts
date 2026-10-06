import { describe, it, expect, vi } from 'vitest'
import { RepoBotDO, recordSlackReceipt } from '../../src/RepoBotDO.js'
import { appendAuditEvent } from '../../src/audit/auditLedger.js'

describe('DAY-006: Telemetry Broadcaster Hooks & Envelope Ingestion', () => {
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

  const mockStub = { broadcastTelemetry: vi.fn(async () => {}), fetch: vi.fn(async () => new Response(JSON.stringify({ok:true}))) };
  const mockEnv: any = {
    REPO_BOT_DO: {
      idFromName: vi.fn(() => ({ toString: () => 'global-id' })),
      get: vi.fn(() => mockStub),
    },
  }

  it('emits SLACK_RECEIPT telemetry and persists to storage', async () => {
    const ctx = createMockDOState()

    // Bypass constructor
    const doInstance = Object.create(RepoBotDO.prototype)
    doInstance.ctx = ctx
    doInstance.env = mockEnv
    doInstance.recentTelemetry = []
    doInstance.telemetrySeq = 0

    const broadcastSpy = vi.spyOn(doInstance, 'broadcastTelemetry')

    const receipt = {
      timestamp: Date.now(),
      channel: 'C0C40FMRQ9H',
      event: 'merged',
      ok: true,
    }

    await recordSlackReceipt(ctx.storage, receipt, doInstance)

    expect(ctx.storage.put).toHaveBeenCalledWith('last_slack_receipt', receipt)
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

    const stub = mockEnv.REPO_BOT_DO.get()
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

    await new Promise(r => setTimeout(r, 10))

    // Using `fetch` since emitEdgeTelemetry is using stub.fetch now for canonical
    expect(mockStub.fetch.mock.calls[0][0].url).toBe('https://internal/broadcast')
  })

  it('broadcasts TASK_TRANSITION through RepoBotDO /fsm/transition handler', async () => {
    const ctx = createMockDOState()

    const doInstance = Object.create(RepoBotDO.prototype)
    doInstance.ctx = ctx
    doInstance.env = mockEnv
    doInstance.recentTelemetry = []
    doInstance.telemetrySeq = 0

    const broadcastSpy = vi.spyOn(doInstance, 'broadcastTelemetry')

    const req = new Request('http://internal/fsm/transition', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId: 'TASK-23.8', state: 'AWAITING_APPROVAL' }),
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
