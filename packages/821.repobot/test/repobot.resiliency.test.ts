import test from 'ava'
import { RepobotModel } from '../00.repobot.unit/repobot.model.js'
import {
  connectRepobot,
  disconnectRepobot,
} from '../00.repobot.unit/buz/repobot.buzz.js'

class MockResilientWebSocket {
  public onopen: (() => void) | null = null
  public onmessage: ((event: any) => void) | null = null
  public onclose: ((event: any) => void) | null = null
  public onerror: ((event: any) => void) | null = null
  public closedCode: number | null = null
  public closedReason: string | null = null

  public url: string;
  constructor(url: string) {
    this.url = url;
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

test.before(() => {
  ;(globalThis as any).WebSocket = MockResilientWebSocket
})

test.after(() => {
  delete (globalThis as any).WebSocket
})

test.serial(
  'NEGATIVE CONTROL: detects frame drop and warns cns00 on sequence gap',
  async (t) => {
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
    t.truthy(ws)

    // Receive initial seq 1
    await ws.onmessage!({
      data: JSON.stringify({ seq: 1, ascii: '>> [TELEMETRY] Init' }),
    })
    t.is(model.lastSeqReceived, 1)

    // Receive jump to seq 6 (dropped 2, 3, 4, 5 -> total 4 dropped)
    await ws.onmessage!({
      data: JSON.stringify({ seq: 6, ascii: '>> [TELEMETRY] Jumped' }),
    })
    t.is(model.lastSeqReceived, 6)

    const warnLog = consoleLogs.find((msg) =>
      msg.includes('Dropped 4 telemetry frame(s) during transit.'),
    )
    t.truthy(warnLog, 'Must emit drop warning for missing sequence delta')
  },
)

test.serial(
  'NEGATIVE CONTROL: rejects duplicate connection attempts idempotently',
  async (t) => {
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
    t.is(model.connectionState, 'CONNECTED')
    const firstSocket = model.ws

    // Redundant connect attempt
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

    t.is(model.ws, firstSocket, 'Must not replace active socket handle')
    t.true(noopResolved, 'Must resolve with connect-repobot-noop bit')
    t.true(
      consoleLogs.some((l) =>
        l.includes('Connection already active. Skipping re-connect.'),
      ),
    )
  },
)

test.serial(
  'NEGATIVE CONTROL: schedules exponential backoff on unexpected socket close',
  async (t) => {
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
    // Simulate drop
    ws.close(1006, 'Abnormal TCP Closure')
    await new Promise((r) => setTimeout(r, 10))

    t.is(model.connectionState, 'RECONNECTING')
    t.is(model.ws, null)
    t.is(model.reconnectAttempts, 1)
    t.truthy(model.reconnectTimer, 'Reconnect timer must be scheduled')

    // Clean up timer to prevent leak
    clearTimeout(model.reconnectTimer)
    model.reconnectTimer = null
  },
)

test.serial(
  'NEGATIVE CONTROL: disconnectRepobot purges active timer and closes cleanly',
  async (t) => {
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

    t.is(model.connectionState, 'DISCONNECTED')
    t.is(model.ws, null)
    t.is(model.reconnectTimer, null, 'Must nullify timer')
    t.is(model.reconnectAttempts, 0, 'Must reset attempts')
    t.true(disconnectedBit)
  },
)

test.serial(
  'NEGATIVE CONTROL: handles non-JSON payload over socket without throwing',
  async (t) => {
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
    await t.notThrowsAsync(async () => {
      await ws.onmessage!({ data: '<<< MALFORMED TEXT BUFFER NOT JSON >>>' })
    })

    const parseErrorLog = consoleLogs.find((l) => l.includes('[PARSE ERROR]'))
    t.truthy(
      parseErrorLog,
      'Must report parse error to cns00 without fatal throw',
    )
  },
)
