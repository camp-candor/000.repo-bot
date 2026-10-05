import test from 'ava'
import sinon from 'sinon'
import { RepobotModel } from '../00.repobot.unit/repobot.model.js'
import {
    connectRepobot,
    disconnectRepobot,
    getBaseUrl,
} from '../00.repobot.unit/buz/repobot.buzz.js'

class MockWebSocket {
    public onopen: (() => void) | null = null
    public onmessage: ((event: any) => void) | null = null
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

test.before(() => {
    ;(globalThis as any).WebSocket = MockWebSocket
})

test.after(() => {
    delete (globalThis as any).WebSocket
})

test('getBaseUrl respects 4-tier target cascade priority', (t) => {
    // Default fallback
    delete (globalThis as any).agentBaseUrl
    delete (globalThis as any).repobotBaseUrl
    delete process.env.LIVE_WORKER_URL
    delete process.env.WORKER_URL
    t.is(getBaseUrl(), 'https://repo-bot-00.berad4000.workers.dev')

    // Env override
    process.env.WORKER_URL = 'http://env-worker.internal/'
    t.is(getBaseUrl(), 'http://env-worker.internal')

    // Repobot dynamic override
    ;(globalThis as any).repobotBaseUrl = 'http://127.0.0.1:8788/'
    t.is(getBaseUrl(), 'http://127.0.0.1:8788')

    // Top priority agentBaseUrl
    ;(globalThis as any).agentBaseUrl = 'http://127.0.0.1:8787/'
    t.is(getBaseUrl(), 'http://127.0.0.1:8787')

    // Teardown
    delete (globalThis as any).agentBaseUrl
    delete (globalThis as any).repobotBaseUrl
    delete process.env.WORKER_URL
})

test.serial(
    'connectRepobot connects and sets state to CONNECTED',
    async (t) => {
        const model = new RepobotModel()
        const slv = sinon.fake()
        const bal = { slv } as any
        const ste = { hunt: sinon.fake.resolves({}) } as any

        await connectRepobot(model, bal, ste)

        // Wait for mock onopen
        await new Promise((r) => setTimeout(r, 25))

        t.is(model.connectionState, 'CONNECTED')
        t.truthy(model.ws)
        t.is(model.reconnectAttempts, 0)
        t.true(slv.calledOnce)
    },
)

test.serial(
    'connectRepobot handles frames and detects sequence drops',
    async (t) => {
        const model = new RepobotModel()
        const ste = { hunt: sinon.fake.resolves({}) } as any

        await connectRepobot(model, {}, ste)
        await new Promise((r) => setTimeout(r, 20))

        const mockWs = model.ws as MockWebSocket
        t.truthy(mockWs)

        // Send packet 1
        await mockWs.onmessage!({
            data: JSON.stringify({
                seq: 1,
                ascii: '>> [TELEMETRY] Frame 1',
            }),
        })
        t.is(model.lastSeqReceived, 1)

        // Send packet 4 (dropped 2 and 3)
        await mockWs.onmessage!({
            data: JSON.stringify({
                seq: 4,
                ascii: '>> [TELEMETRY] Frame 4',
            }),
        })
        t.is(model.lastSeqReceived, 4)

        // Assert console logged dropped warning
        const calls = ste.hunt.getCalls()
        const droppedCall = calls.find((c: any) =>
            c.args[1]?.src?.includes('Dropped 2 telemetry frame(s)'),
        )
        t.truthy(droppedCall)
    },
)

test.serial(
    'disconnectRepobot cleanly halts connection and clears timers',
    async (t) => {
        const model = new RepobotModel()
        const slv = sinon.fake()
        const ste = { hunt: sinon.fake.resolves({}) } as any

        await connectRepobot(model, {}, ste)
        await new Promise((r) => setTimeout(r, 20))

        model.reconnectTimer = setTimeout(() => {}, 10000)

        await disconnectRepobot(model, { slv }, ste)

        t.is(model.connectionState, 'DISCONNECTED')
        t.is(model.ws, null)
        t.is(model.reconnectTimer, null)
        t.is(model.reconnectAttempts, 0)
        t.true(slv.calledOnce)
    },
)
