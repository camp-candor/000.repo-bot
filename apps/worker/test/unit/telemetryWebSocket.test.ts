import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { RepoBotDO } from '../../src/RepoBotDO.js'

describe('RepoBotDO WebSocket Hibernation Engine', () => {
    function createMockDOState() {
        const sockets: any[] = []
        return {
            id: { toString: () => 'mock-id' },
            waitUntil: vi.fn(),
            storage: {
                get: vi.fn().mockResolvedValue(null),
                put: vi.fn().mockResolvedValue(undefined),
                setAlarm: vi.fn().mockResolvedValue(undefined),
                deleteAlarm: vi.fn().mockResolvedValue(undefined),
            },
            acceptWebSocket: vi.fn((ws: any, tags: string[]) => {
                ws.__tags = tags
                // Mock the internal Cloudflare state so `server.send` doesn't throw
                ws.accept = vi.fn()
                // Force an accept so the mock doesn't fail the internal check
                ws.accept()
                sockets.push(ws)
            }),
            getWebSockets: vi.fn((tag?: string) => {
                if (!tag) return sockets
                return sockets.filter((s) => s.__tags?.includes(tag))
            }),
        } as any
    }

    const mockEnv: any = {
        SLACK_CHANNEL_ID: 'C0C40FMRQ9H',
    }

    let doInstance: any;
    let OriginalWebSocketPair: any;

    beforeEach(() => {
        const ctx = createMockDOState();
        doInstance = Object.create(RepoBotDO.prototype);
        doInstance.ctx = ctx;
        doInstance.env = mockEnv;
        doInstance.telemetrySeq = 0;

        OriginalWebSocketPair = (globalThis as any).WebSocketPair;
        (globalThis as any).WebSocketPair = function() {
            const pair = new OriginalWebSocketPair();
            const server = Object.values(pair)[1] as any;
            server.serializeAttachment = vi.fn();
            server.send = vi.fn();
            return pair;
        } as any;
    });

    afterEach(() => {
        (globalThis as any).WebSocketPair = OriginalWebSocketPair;
    });

    it('rejects plain HTTP GET requests without Upgrade header with 426', async () => {
        const req = new Request('http://internal/ws/telemetry', {
            method: 'GET',
        })

        const res = await doInstance.fetch(req)
        expect(res.status).toBe(426)
        const text = await res.text()
        expect(text).toContain('Expected Upgrade: websocket')
    })

    it('accepts valid WebSocket upgrades, attaches metadata, and emits HEARTBEAT', async () => {
        const req = new Request('http://internal/ws/telemetry?role=operator', {
            headers: { Upgrade: 'websocket' },
        })

        const res = await doInstance.fetch(req)
        expect(res.status).toBe(101)
        expect(res.webSocket).toBeDefined()

        // Verify registration under Hibernation API
        expect(doInstance.ctx.acceptWebSocket).toHaveBeenCalledTimes(1)
        expect(doInstance.ctx.acceptWebSocket).toHaveBeenCalledWith(expect.anything(), [
            'operator',
        ])

        // Verify initial heartbeat frame sent to the client
        const activeSockets = doInstance.ctx.getWebSockets('operator')
        expect(activeSockets.length).toBe(1)
    })

    it('broadcastTelemetry increments sequence and sends clean ASCII packets', async () => {
        // Register client
        const req = new Request('http://internal/ws/telemetry', {
            headers: { Upgrade: 'websocket' },
        })
        await doInstance.fetch(req)

        const socket = doInstance.ctx.getWebSockets('operator')[0]
        const sendSpy = vi.spyOn(socket, 'send')

        await doInstance.broadcastTelemetry(
            'TASK_TRANSITION',
            'RepoBotDO',
            { taskId: 'TASK-01', state: 'VERIFYING' },
            '>> [FSM] Task TASK-01 -> VERIFYING',
        )

        expect(sendSpy).toHaveBeenCalled()
        const lastPayload = JSON.parse(
            sendSpy.mock.calls[sendSpy.mock.calls.length - 1][0] as string,
        )

        expect(lastPayload.type).toBe('TASK_TRANSITION')
        expect(lastPayload.source).toBe('RepoBotDO')
        expect(lastPayload.seq).toBe(2) // 1 was HEARTBEAT, 2 is this broadcast
        expect(lastPayload.ascii).toBe('>> [FSM] Task TASK-01 -> VERIFYING')
    })

    it('handles incoming PING over WebSocket with PONG without isolate crashing', async () => {
        const mockWs = {
            send: vi.fn(),
            close: vi.fn(),
        } as any

        await doInstance.webSocketMessage(mockWs, 'PING')
        expect(mockWs.send).toHaveBeenCalled()
        const response = JSON.parse(mockWs.send.mock.calls[0][0])
        expect(response.type).toBe('PONG')
        expect(response.ts).toBeDefined()
    })
})
