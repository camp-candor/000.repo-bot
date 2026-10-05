import { describe, it, expect, vi } from 'vitest'
import { RepoBotDO } from '../../src/RepoBotDO.js'

describe('EPIC-23: Edge Telemetry Resiliency & Negative Controls', () => {
  function createMockDOState() {
    const sockets: any[] = []
    return {
      storage: {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn().mockResolvedValue(undefined),
        setAlarm: vi.fn().mockResolvedValue(undefined),
        deleteAlarm: vi.fn().mockResolvedValue(undefined),
      },
      acceptWebSocket: vi.fn((ws: any, tags: string[]) => {
        ws.__tags = tags
        sockets.push(ws)
      }),
      getWebSockets: vi.fn((tag?: string) => {
        if (!tag) return sockets
        return sockets.filter((s) => s.__tags?.includes(tag))
      }),
      waitUntil: vi.fn(),
    } as any
  }

  const mockEnv: any = {
    SLACK_CHANNEL_ID: 'C0C40FMRQ9H',
  }

  it('NEGATIVE CONTROL: rejects plain HTTP requests lacking Upgrade header with HTTP 426', async () => {
    const ctx = createMockDOState()
    const doInstance = Object.create(RepoBotDO.prototype)
    doInstance.ctx = ctx
    doInstance.env = mockEnv
    doInstance.telemetrySeq = 0

    const methods = ['GET', 'POST', 'DELETE']
    for (const method of methods) {
      const req = new Request('http://internal/ws/telemetry', { method })
      const res = await doInstance.fetch(req)
      expect(res.status).toBe(426)
      const text = await res.text()
      expect(text).toContain('Expected Upgrade: websocket')
    }
  })

  it('NEGATIVE CONTROL: traps broken socket send and prunes dead handles without crashing', async () => {
    const ctx = createMockDOState()
    const doInstance = Object.create(RepoBotDO.prototype)
    doInstance.ctx = ctx
    doInstance.env = mockEnv
    doInstance.telemetrySeq = 0

    // 1. Establish two client sockets
    const req1 = new Request('http://internal/ws/telemetry?role=operator1', {
      headers: { Upgrade: 'websocket' },
    })
    const req2 = new Request('http://internal/ws/telemetry?role=operator2', {
      headers: { Upgrade: 'websocket' },
    })

    await doInstance.fetch(req1)
    await doInstance.fetch(req2)

    const sockets = ctx.getWebSockets('operator')
    expect(sockets.length).toBe(2)

    const deadSocket = sockets[0]
    const healthySocket = sockets[1]

    // 2. Mock dead socket throwing on write
    vi.spyOn(deadSocket, 'send').mockImplementation(() => {
      throw new Error('Broken pipe: socket disconnected')
    })
    const deadCloseSpy = vi.spyOn(deadSocket, 'close')
    const healthySendSpy = vi.spyOn(healthySocket, 'send')

    // 3. Broadcast telemetry
    await doInstance.broadcastTelemetry(
      'PR_EVENT',
      'prAuditEngine',
      { pullNumber: 42 },
      '>> [SCOPE CHECK OK] PR #42 verified.',
    )

    // 4. Assert dead socket was terminated with 1011 and healthy socket received message
    expect(deadCloseSpy).toHaveBeenCalledWith(
      1011,
      'Broadcast transmission failure',
    )
    expect(healthySendSpy).toHaveBeenCalled()
  })

  it('NEGATIVE CONTROL: handles corrupted JSON message over websocket gracefully', async () => {
    const ctx = createMockDOState()
    const doInstance = Object.create(RepoBotDO.prototype)
    doInstance.ctx = ctx
    doInstance.env = mockEnv
    doInstance.telemetrySeq = 0

    const mockWs = {
      send: vi.fn(),
      close: vi.fn(),
    } as any

    // Feed non-JSON string; must not throw
    await expect(
      doInstance.webSocketMessage(mockWs, '{ malformed json content ...'),
    ).resolves.not.toThrow()
  })

  it('NEGATIVE CONTROL: webSocketError terminates socket with code 1011', async () => {
    const ctx = createMockDOState()
    const doInstance = Object.create(RepoBotDO.prototype)
    doInstance.ctx = ctx
    doInstance.env = mockEnv
    doInstance.telemetrySeq = 0

    const mockWs = {
      close: vi.fn(),
    } as any

    await doInstance.webSocketError(mockWs, new Error('Network fault'))
    expect(mockWs.close).toHaveBeenCalledWith(1011, 'WebSocket error')
  })

  it('enforces monotonic sequence ordering across concurrent broadcast calls', async () => {
    const ctx = createMockDOState()
    const doInstance = Object.create(RepoBotDO.prototype)
    doInstance.ctx = ctx
    doInstance.env = mockEnv
    doInstance.telemetrySeq = 0

    const req = new Request('http://internal/ws/telemetry', {
      headers: { Upgrade: 'websocket' },
    })

    const emittedSequences: number[] = []

    // Intercept acceptWebSocket to spy on the server socket
    ctx.acceptWebSocket = vi.fn((ws: any, tags: string[]) => {
      ws.__tags = tags
      vi.spyOn(ws, 'send').mockImplementation((data: any) => {
        const parsed = JSON.parse(data)
        emittedSequences.push(parsed.seq)
      })
      // Add to our mock sockets array
      const sockets = ctx.getWebSockets()
      sockets.push(ws)
    })

    await doInstance.fetch(req)

    // Initial handshake is seq 1. Now emit 3 rapid broadcasts.
    await Promise.all([
      doInstance.broadcastTelemetry('TASK_TRANSITION', 'test', {}, '>> [1]'),
      doInstance.broadcastTelemetry('TASK_TRANSITION', 'test', {}, '>> [2]'),
      doInstance.broadcastTelemetry('TASK_TRANSITION', 'test', {}, '>> [3]'),
    ])

    expect(emittedSequences.length).toBe(4) // 1 initial + 3 broadcasts
    expect(emittedSequences[0]).toBe(1)
    expect(emittedSequences[1]).toBe(2)
    expect(emittedSequences[2]).toBe(3)
    expect(emittedSequences[3]).toBe(4)
  })
})
