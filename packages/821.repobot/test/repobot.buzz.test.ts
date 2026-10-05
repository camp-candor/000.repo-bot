import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { RepobotModel } from '../00.repobot.unit/repobot.model.js'
import {
  connectRepobot,
  disconnectRepobot,
  getBaseUrl,
} from '../00.repobot.unit/buz/repobot.buzz.js'

class MockWebSocket {
  public onopen: (() => void) | null = null
  public onmessage: ((event: any) => void | Promise<void>) | null = null
  public onclose: ((event: any) => void) | null = null
  public onerror: ((event: any) => void) | null = null
  public closedCode: number | null = null
  public closedReason: string | null = null

  constructor(public url: string) {
    setTimeout(() => {
      if (this.onopen) this.onopen()
    }, 10)
  }

  close(code = 1000, reason = '') {
    this.closedCode = code
    this.closedReason = reason
    if (this.onclose) {
      this.onclose({ code, reason })
    }
  }
}

describe('TASK-23.5: Self-Healing WebSocket Client Engine', () => {
    beforeEach(() => {
        ;(globalThis as any).WebSocket = MockWebSocket
    })

    afterEach(() => {
        delete (globalThis as any).WebSocket
    })

    it('getBaseUrl respects 4-tier target cascade priority', () => {
        // Default fallback
        delete (globalThis as any).agentBaseUrl
        delete (globalThis as any).repobotBaseUrl
        delete process.env.LIVE_WORKER_URL
        delete process.env.WORKER_URL
        expect(getBaseUrl()).toBe('https://repo-bot-00.berad4000.workers.dev')

        // Env override
        process.env.WORKER_URL = 'http://env-worker.internal/'
        expect(getBaseUrl()).toBe('http://env-worker.internal')

        // Repobot dynamic override
        ;(globalThis as any).repobotBaseUrl = 'http://127.0.0.1:8788/'
        expect(getBaseUrl()).toBe('http://127.0.0.1:8788')

        // Top priority agentBaseUrl
        ;(globalThis as any).agentBaseUrl = 'http://127.0.0.1:8787/'
        expect(getBaseUrl()).toBe('http://127.0.0.1:8787')

        // Teardown
        delete (globalThis as any).agentBaseUrl
        delete (globalThis as any).repobotBaseUrl
        delete process.env.WORKER_URL
    })

    it('connectRepobot connects and sets state to CONNECTED', async () => {
        const model = new RepobotModel()
        const slv = vi.fn()
        const bal = { slv } as any
        const ste = { hunt: vi.fn().mockResolvedValue({}) } as any

        await connectRepobot(model, bal, ste)

        // Wait for mock onopen
        await new Promise((r) => setTimeout(r, 25))

        expect(model.connectionState).toBe('CONNECTED')
        expect(model.ws).toBeTruthy()
        expect(model.reconnectAttempts).toBe(0)
        expect(slv).toHaveBeenCalledOnce()
    })

    it('connectRepobot handles frames and detects sequence drops', async () => {
        const model = new RepobotModel()
        const ste = { hunt: vi.fn().mockResolvedValue({}) } as any

        await connectRepobot(model, {}, ste)
        await new Promise((r) => setTimeout(r, 20))

        const mockWs = model.ws as MockWebSocket
        expect(mockWs).toBeTruthy()

        // Send packet 1
        await mockWs.onmessage!({
            data: JSON.stringify({
                seq: 1,
                ascii: '>> [TELEMETRY] Frame 1',
            }),
        })
        expect(model.lastSeqReceived).toBe(1)

        // Send packet 4 (dropped 2 and 3)
        await mockWs.onmessage!({
            data: JSON.stringify({
                seq: 4,
                ascii: '>> [TELEMETRY] Frame 4',
            }),
        })
        expect(model.lastSeqReceived).toBe(4)

        // Assert console logged dropped warning
        const calls = ste.hunt.mock.calls
        const droppedCall = calls.find((c: any) =>
            c[1]?.src?.includes('Dropped 2 telemetry frame(s)'),
        )
        expect(droppedCall).toBeTruthy()
    })

    it('disconnectRepobot cleanly halts connection and clears timers', async () => {
        const model = new RepobotModel()
        const slv = vi.fn()
        const ste = { hunt: vi.fn().mockResolvedValue({}) } as any

        await connectRepobot(model, {}, ste)
        await new Promise((r) => setTimeout(r, 20))

        model.reconnectTimer = setTimeout(() => {}, 10000)

        await disconnectRepobot(model, { slv }, ste)

        expect(model.connectionState).toBe('DISCONNECTED')
        expect(model.ws).toBeNull()
        expect(model.reconnectTimer).toBeNull()
        expect(model.reconnectAttempts).toBe(0)
        expect(slv).toHaveBeenCalledOnce()
    })
})

describe('TASK-23.8.3: Client-Side Ingestion & Sequence Synchronization', () => {
  beforeEach(() => {
    ;(globalThis as any).WebSocket = MockWebSocket
  })

  afterEach(() => {
    delete (globalThis as any).WebSocket
  })

  it('connectRepobot intercepts TELEMETRY_HISTORY and advances pointer without dropping', async () => {
    const model = new RepobotModel()
    const consoleLogs: string[] = []
    const ste = {
      hunt: async (_act: string, bale: any) => {
        if (bale?.src) consoleLogs.push(bale.src)
        return {}
      },
    } as any

    await connectRepobot(model, {}, ste)
    await new Promise((r) => setTimeout(r, 20))

    const mockWs = model.ws as MockWebSocket
    expect(mockWs).toBeTruthy()

    // Ingest historical batch with sequences 10 and 11
    await mockWs.onmessage!({
      data: JSON.stringify({
        seq: 11,
        type: 'TELEMETRY_HISTORY',
        payload: {
          count: 2,
          items: [
            { seq: 10, ascii: '>> 10:00:00 [AUDIT #1] Seeded event 1' },
            { seq: 11, ascii: '>> 10:00:01 [AUDIT #2] Seeded event 2' },
          ],
        },
      }),
    })

    // Assert sequence pointer was synchronized
    expect(model.lastSeqReceived).toBe(11)

    // Assert visual replay banners rendered
    expect(
      consoleLogs.some((l) =>
        l.includes('RESTORING LAST 2 HISTORICAL EDGE EVENT(S)'),
      ),
    ).toBe(true)
    expect(
      consoleLogs.some((l) =>
        l.includes('>> 10:00:00 [AUDIT #1] Seeded event 1'),
      ),
    ).toBe(true)
    expect(consoleLogs.some((l) => l.includes('[LIVE STREAM ENGAGED]'))).toBe(
      true,
    )

    // Now ingest immediate next live packet (seq: 12)
    await mockWs.onmessage!({
      data: JSON.stringify({
        seq: 12,
        ascii: '>> [LIVE] Next event 12',
      }),
    })

    expect(model.lastSeqReceived).toBe(12)
    // Assert NO drop warning was emitted
    expect(consoleLogs.some((l) => l.includes('Dropped'))).toBe(false)
  })

  it('disconnectRepobot cleanly halts connection and clears timers', async () => {
    const model = new RepobotModel()
    const slv = vi.fn()
    const ste = { hunt: vi.fn().mockResolvedValue({}) } as any

    await connectRepobot(model, {}, ste)
    await new Promise((r) => setTimeout(r, 20))

    model.reconnectTimer = setTimeout(() => {}, 10000)

    await disconnectRepobot(model, { slv }, ste)

    expect(model.connectionState).toBe('DISCONNECTED')
    expect(model.ws).toBeNull()
    expect(model.reconnectTimer).toBeNull()
    expect(model.reconnectAttempts).toBe(0)
    expect(slv).toHaveBeenCalledOnce()
  })
})
