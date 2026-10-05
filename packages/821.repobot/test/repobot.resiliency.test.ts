import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { RepobotModel } from '../00.repobot.unit/repobot.model.js'
import {
    connectRepobot,
    disconnectRepobot,
} from '../00.repobot.unit/buz/repobot.buzz.js'

class MockResilientWebSocket {
    public onopen: (() => void) | null = null
    public onmessage: ((event: any) => void | Promise<void>) | null = null
    public onclose: ((event: any) => void | Promise<void>) | null = null
    public onerror: ((event: any) => void | Promise<void>) | null = null
    public closedCode: number | null = null
    public closedReason: string | null = null

    constructor(public url: string) {
        setTimeout(() => {
            if (this.onopen) this.onopen()
        }, 10)
    }

    async close(code = 1000, reason = '') {
        this.closedCode = code
        this.closedReason = reason
        if (this.onclose) {
            await this.onclose({ code, reason })
        }
    }
}

describe('TASK-23.7: Repobot Telemetry Resiliency & Negative Controls', () => {
    beforeEach(() => {
        ;(globalThis as any).WebSocket = MockResilientWebSocket
    })

    afterEach(() => {
        delete (globalThis as any).WebSocket
    })

    it('NEGATIVE CONTROL: detects frame drop and warns cns00 on sequence gap', async () => {
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

        const ws = model.ws as MockResilientWebSocket
        expect(ws).toBeTruthy()

        // Receive initial seq 1
        await ws.onmessage!({
            data: JSON.stringify({ seq: 1, ascii: '>> [TELEMETRY] Init' }),
        })
        expect(model.lastSeqReceived).toBe(1)

        // Receive jump to seq 6 (dropped 2, 3, 4, 5 -> total 4 dropped)
        await ws.onmessage!({
            data: JSON.stringify({ seq: 6, ascii: '>> [TELEMETRY] Jumped' }),
        })
        expect(model.lastSeqReceived).toBe(6)

        const warnLog = consoleLogs.find((msg) =>
            msg.includes('Dropped 4 telemetry frame(s) during transit.'),
        )
        expect(warnLog).toBeTruthy()
    })

    it('NEGATIVE CONTROL: rejects duplicate connection attempts idempotently', async () => {
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
        expect(model.connectionState).toBe('CONNECTED')
        const firstSocket = model.ws

        // Redundant connect attempt
        let noopResolved = false
        await connectRepobot(
            model,
            {
                slv: (res: any) => {
                    if (res?.rbtBit?.idx === 'connect-repobot-noop')
                        noopResolved = true
                },
            },
            ste,
        )

        expect(model.ws).toBe(firstSocket)
        expect(noopResolved).toBe(true)
        expect(
            consoleLogs.some((l) =>
                l.includes('Connection already active. Skipping re-connect.'),
            ),
        ).toBe(true)
    })

    it('NEGATIVE CONTROL: schedules exponential backoff on unexpected socket close', async () => {
        const model = new RepobotModel()
        const ste = {
            hunt: async () => ({}),
        } as any

        await connectRepobot(model, {}, ste)
        await new Promise((r) => setTimeout(r, 20))

        const ws = model.ws as MockResilientWebSocket
        // Simulate drop
        await ws.close(1006, 'Abnormal TCP Closure')

        expect(model.connectionState).toBe('RECONNECTING')
        expect(model.ws).toBeNull()
        expect(model.reconnectAttempts).toBe(1)
        expect(model.reconnectTimer).toBeTruthy()

        // Clean up timer to prevent leak
        clearTimeout(model.reconnectTimer)
        model.reconnectTimer = null
    })

    it('NEGATIVE CONTROL: disconnectRepobot purges active timer and closes cleanly', async () => {
        const model = new RepobotModel()
        const ste = { hunt: async () => ({}) } as any

        await connectRepobot(model, {}, ste)
        await new Promise((r) => setTimeout(r, 20))

        // Arm synthetic reconnect timer
        model.reconnectTimer = setTimeout(() => {}, 15000)
        model.reconnectAttempts = 3

        let disconnectedBit = false
        await disconnectRepobot(
            model,
            {
                slv: (res: any) => {
                    if (res?.rbtBit?.idx === 'disconnect-repobot-success')
                        disconnectedBit = true
                },
            },
            ste,
        )

        expect(model.connectionState).toBe('DISCONNECTED')
        expect(model.ws).toBeNull()
        expect(model.reconnectTimer).toBeNull()
        expect(model.reconnectAttempts).toBe(0)
        expect(disconnectedBit).toBe(true)
    })

    it('NEGATIVE CONTROL: handles non-JSON payload over socket without throwing', async () => {
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

        const ws = model.ws as MockResilientWebSocket
        // Ingest invalid JSON
        expect(() => {
            ws.onmessage!({ data: '<<< MALFORMED TEXT BUFFER NOT JSON >>>' })
        }).not.toThrow()

        const parseErrorLog = consoleLogs.find((l) =>
            l.includes('[PARSE ERROR]'),
        )
        expect(parseErrorLog).toBeTruthy()
    })
})


describe('TASK-23.8.5: Repobot Telemetry Resiliency & Negative Controls', () => {
  beforeEach(() => {
    ;(globalThis as any).WebSocket = MockResilientWebSocket
  })

  afterEach(() => {
    delete (globalThis as any).WebSocket
  })

  it('NEGATIVE CONTROL: detects frame drop and warns cns00 on sequence gap', async () => {
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

    const ws = model.ws as MockResilientWebSocket
    expect(ws).toBeTruthy()

    // Receive initial seq 1
    await ws.onmessage!({
      data: JSON.stringify({ seq: 1, ascii: '>> [TELEMETRY] Init' }),
    })
    expect(model.lastSeqReceived).toBe(1)

    // Receive jump to seq 6 (dropped 2, 3, 4, 5 -> total 4 dropped)
    await ws.onmessage!({
      data: JSON.stringify({ seq: 6, ascii: '>> [TELEMETRY] Jumped' }),
    })
    expect(model.lastSeqReceived).toBe(6)

    const warnLog = consoleLogs.find((msg) =>
      msg.includes('Dropped 4 telemetry frame(s) during transit.'),
    )
    expect(warnLog).toBeTruthy()
  })

  it('NEGATIVE CONTROL: preserves genuine sequence drop detection following history replay', async () => {
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

    const ws = model.ws as MockResilientWebSocket

    // Replay synchronizes up to seq 20
    await ws.onmessage!({
      data: JSON.stringify({
        seq: 20,
        type: 'TELEMETRY_HISTORY',
        payload: {
          items: [
            { seq: 19, ascii: '>> [19]' },
            { seq: 20, ascii: '>> [20]' },
          ],
        },
      }),
    })
    expect(model.lastSeqReceived).toBe(20)

    // Live packet skips 21, 22, arrives at 23 (2 frames dropped)
    await ws.onmessage!({
      data: JSON.stringify({ seq: 23, ascii: '>> [23]' }),
    })
    expect(model.lastSeqReceived).toBe(23)

    const dropWarn = consoleLogs.find((l) =>
      l.includes('Dropped 2 telemetry frame(s)'),
    )
    expect(dropWarn).toBeTruthy()
  })

  it('NEGATIVE CONTROL: rejects duplicate connection attempts idempotently', async () => {
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
    expect(model.connectionState).toBe('CONNECTED')
    const firstSocket = model.ws

    let noopResolved = false
    await connectRepobot(
      model,
      {
        slv: (res: any) => {
          if (res?.rbtBit?.idx === 'connect-repobot-noop') noopResolved = true
        },
      },
      ste,
    )

    expect(model.ws).toBe(firstSocket)
    expect(noopResolved).toBe(true)
    expect(
      consoleLogs.some((l) =>
        l.includes('Connection already active. Skipping re-connect.'),
      ),
    ).toBe(true)
  })

  it('NEGATIVE CONTROL: handles empty or malformed TELEMETRY_HISTORY without throwing', async () => {
    const model = new RepobotModel()
    const ste = { hunt: async () => ({}) } as any

    await connectRepobot(model, {}, ste)
    await new Promise((r) => setTimeout(r, 20))

    const ws = model.ws as MockResilientWebSocket

    // Ingest empty items array (cold genesis N=0)
    let caughtEmpty = false
    try {
      await ws.onmessage!({
        data: JSON.stringify({
          type: 'TELEMETRY_HISTORY',
          payload: { items: [] },
        }),
      })
    } catch (e) {
      caughtEmpty = true
    }
    expect(caughtEmpty).toBe(false)

    // Ingest malformed missing payload
    let caughtMalformed = false
    try {
      await ws.onmessage!({
        data: JSON.stringify({
          type: 'TELEMETRY_HISTORY',
          payload: null,
        }),
      })
    } catch (e) {
      caughtMalformed = true
    }
    expect(caughtMalformed).toBe(false)
  })

  it('NEGATIVE CONTROL: disconnectRepobot purges active timer and closes cleanly', async () => {
    const model = new RepobotModel()
    const ste = { hunt: async () => ({}) } as any

    await connectRepobot(model, {}, ste)
    await new Promise((r) => setTimeout(r, 20))

    model.reconnectTimer = setTimeout(() => {}, 15000)
    model.reconnectAttempts = 3

    let disconnectedBit = false
    await disconnectRepobot(
      model,
      {
        slv: (res: any) => {
          if (res?.rbtBit?.idx === 'disconnect-repobot-success')
            disconnectedBit = true
        },
      },
      ste,
    )

    expect(model.connectionState).toBe('DISCONNECTED')
    expect(model.ws).toBeNull()
    expect(model.reconnectTimer).toBeNull()
    expect(model.reconnectAttempts).toBe(0)
    expect(disconnectedBit).toBe(true)
  })

  it('NEGATIVE CONTROL: handles non-JSON payload over socket without throwing', async () => {
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

    const ws = model.ws as MockResilientWebSocket
    let threw = false
    try {
      await ws.onmessage!({ data: '<<< MALFORMED TEXT BUFFER NOT JSON >>>' })
    } catch (e) {
      threw = true
    }
    expect(threw).toBe(false)

    const parseErrorLog = consoleLogs.find((l) => l.includes('[PARSE ERROR]'))
    expect(parseErrorLog).toBeTruthy()
  })
})
