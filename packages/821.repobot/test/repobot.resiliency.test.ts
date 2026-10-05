import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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
        await new Promise((r) => setTimeout(r, 10))
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
        await new Promise((r) => setTimeout(r, 10))
        expect(model.lastSeqReceived).toBe(20)

        // Live packet skips 21, 22, arrives at 23 (2 frames dropped)
        await ws.onmessage!({
            data: JSON.stringify({ seq: 23, ascii: '>> [23]' }),
        })
        await new Promise((r) => setTimeout(r, 10))
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

    it('NEGATIVE CONTROL: handles empty or malformed TELEMETRY_HISTORY without throwing', async () => {
        const model = new RepobotModel()
        const ste = { hunt: async () => ({}) } as any

        await connectRepobot(model, {}, ste)
        await new Promise((r) => setTimeout(r, 20))

        const ws = model.ws as MockResilientWebSocket

        // Ingest empty items array (cold genesis N=0)
        await ws.onmessage!({
            data: JSON.stringify({
                type: 'TELEMETRY_HISTORY',
                payload: { items: [] },
            }),
        })

        // Ingest malformed missing payload
        await ws.onmessage!({
            data: JSON.stringify({
                type: 'TELEMETRY_HISTORY',
                payload: null,
            }),
        })
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
        await ws.onmessage!({ data: '<<< MALFORMED TEXT BUFFER NOT JSON >>>' })

        const parseErrorLog = consoleLogs.find((l) =>
            l.includes('[PARSE ERROR]'),
        )
        expect(parseErrorLog).toBeTruthy()
    })
})
