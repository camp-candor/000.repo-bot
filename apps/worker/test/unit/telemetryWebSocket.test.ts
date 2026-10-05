import { describe, it, expect, vi, beforeEach } from 'vitest'
import app from '../../src/index.js'
import { RepoBotDO, type TelemetryPacket } from '../../src/RepoBotDO.js'

function createRepoBotDO(ctx: any, env: any): RepoBotDO {
    const instance = Object.create(RepoBotDO.prototype)
    instance.ctx = ctx
    instance.env = env
    instance.telemetrySeq = 0
    return instance
}

describe('TASK-23.2: Durable Object WebSocket Hibernation Engine & Telemetry Ingress', () => {
    let mockStorage: Map<string, any>
    let mockCtx: any
    let mockEnv: any
    let registeredWebSockets: any[]

    beforeEach(() => {
        mockStorage = new Map()
        registeredWebSockets = []

        mockCtx = {
            storage: {
                get: vi.fn(async (key: string) => mockStorage.get(key) || null),
                put: vi.fn(async (key: string, value: any) => {
                    mockStorage.set(key, value)
                }),
                delete: vi.fn(async (key: string) => {
                    mockStorage.delete(key)
                }),
                setAlarm: vi.fn(async () => {}),
                deleteAlarm: vi.fn(async () => {}),
            },
            acceptWebSocket: vi.fn((ws: any, tags?: string[]) => {
                ws._tags = tags || []
                ws.send = vi.fn(ws.send || (() => {}))
                registeredWebSockets.push(ws)
            }),
            getWebSockets: vi.fn((tag?: string) => {
                if (!tag) return registeredWebSockets
                return registeredWebSockets.filter((ws) =>
                    ws._tags?.includes(tag),
                )
            }),
            waitUntil: vi.fn((promise: Promise<any>) => promise),
        }

        mockEnv = {
            CLOUDFLARE_ACCOUNT_ID: 'test-account-id',
            CLOUDFLARE_API_TOKEN: 'test-api-token',
            CLOUDFLARE_AI_GATEWAY: 'default',
            GITHUB_TOKEN: 'test-gh-token',
            REPO_BOT_DO: {
                idFromName: vi.fn().mockReturnValue('mock-global-id'),
                get: vi.fn().mockReturnValue({
                    fetch: vi.fn(async (req: Request) => {
                        const doInstance = createRepoBotDO(mockCtx, mockEnv)
                        return doInstance.fetch(req)
                    }),
                }),
            },
        }
    })

    describe('1. Gateway Ingress & Protocol Guards (HTTP 426 vs HTTP 101)', () => {
        it('rejects plain HTTP GET /ws/telemetry without Upgrade header with HTTP 426', async () => {
            const req = new Request('http://localhost/ws/telemetry', {
                method: 'GET',
            })
            const res = await app.fetch(req, mockEnv)
            expect(res.status).toBe(426)
            const text = await res.text()
            expect(text).toBe('Expected Upgrade: websocket')
        })

        it('rejects plain HTTP GET /ws without Upgrade header with HTTP 426', async () => {
            const req = new Request('http://localhost/ws', {
                method: 'GET',
            })
            const res = await app.fetch(req, mockEnv)
            expect(res.status).toBe(426)
            const text = await res.text()
            expect(text).toBe('Expected Upgrade: websocket')
        })

        it('proxies valid WebSocket upgrade request to global RepoBotDO', async () => {
            const req = new Request('http://localhost/ws/telemetry', {
                method: 'GET',
                headers: {
                    Upgrade: 'websocket',
                },
            })
            const res = await app.fetch(req, mockEnv)
            expect(res.status).toBe(101)
            expect(res.webSocket).toBeDefined()
            expect(mockEnv.REPO_BOT_DO.idFromName).toHaveBeenCalledWith(
                'global',
            )
        })
    })

    describe('2. RepoBotDO Hibernation Handshake & Attachment Discipline & TASK-23.8', () => {
        it('TASK-23.8.1 & TASK-23.8.2: replays historical backlog (K=10) on socket handshake', async () => {
            const historicalSeed = [
                {
                    seq: 10,
                    ts: 1000,
                    type: 'AUDIT_LOG',
                    source: 'auditLedger',
                    payload: {},
                    ascii: '>> [AUDIT #1]',
                },
                {
                    seq: 11,
                    ts: 2000,
                    type: 'TASK_TRANSITION',
                    source: 'fsm',
                    payload: {},
                    ascii: '>> [FSM] Claimed',
                },
            ]

            mockStorage.set('recent_telemetry', historicalSeed)

            const doInstance = createRepoBotDO(mockCtx, mockEnv)

            const req = new Request('http://internal/ws/telemetry', {
                headers: { Upgrade: 'websocket' },
            })

            await doInstance.fetch(req)

            const socket = registeredWebSockets[0]
            expect(socket.send).toHaveBeenCalledTimes(2)

            // 1st message is HEARTBEAT
            expect(JSON.parse(socket.send.mock.calls[0][0]).type).toBe(
                'HEARTBEAT',
            )

            // 2nd message is TELEMETRY_HISTORY containing seeded backlog
            const historyPacket = JSON.parse(socket.send.mock.calls[1][0])
            expect(historyPacket.type).toBe('TELEMETRY_HISTORY')
            expect(historyPacket.payload.count).toBe(2)
            expect(historyPacket.payload.items.length).toBe(2)
            expect(historyPacket.payload.items[0].ascii).toBe('>> [AUDIT #1]')
            expect(historyPacket.payload.items[1].ascii).toBe(
                '>> [FSM] Claimed',
            )
        })

        it('TASK-23.8.1: clamps ring buffer to strictly 10 items when broadcasts exceed ceiling', async () => {
            const doInstance = createRepoBotDO(mockCtx, mockEnv)

            // Emit 15 rapid broadcasts
            for (let i = 1; i <= 15; i++) {
                await doInstance.broadcastTelemetry(
                    'AUDIT_LOG',
                    'test',
                    { index: i },
                    `>> [AUDIT #${i}] Event ${i}`,
                )
            }

            const storedBuffer = mockStorage.get('recent_telemetry')
            expect(storedBuffer).toBeDefined()
            expect(storedBuffer.length).toBe(10)
            // Earliest item in buffer must be index 6, latest is 15
            expect(storedBuffer[0].payload.index).toBe(6)
            expect(storedBuffer[9].payload.index).toBe(15)
        })

        it('delivers historical replay only to connecting socket without leaking to existing peers', async () => {
            const doInstance = createRepoBotDO(mockCtx, mockEnv)

            // 1. First connection
            const req1 = new Request('http://internal/ws/telemetry?role=operator', {
                headers: { Upgrade: 'websocket' },
            })
            await doInstance.fetch(req1)
            const socket1 = registeredWebSockets[0]

            // 2. Broadcast event
            await doInstance.broadcastTelemetry(
                'TASK_TRANSITION',
                'fsm',
                {},
                '>> [FSM] Live 1',
            )

            // socket1 has received: HEARTBEAT (index 0) + Live 1 broadcast (index 1)
            expect(socket1.send).toHaveBeenCalledTimes(2)

            // 3. Second connection
            const req2 = new Request('http://internal/ws/telemetry?role=operator', {
                headers: { Upgrade: 'websocket' },
            })
            await doInstance.fetch(req2)
            const socket2 = registeredWebSockets[1]

            // socket2 has received: HEARTBEAT (index 0) + TELEMETRY_HISTORY (index 1)
            expect(socket2.send).toHaveBeenCalledTimes(2)
            const historyPacket = JSON.parse(socket2.send.mock.calls[1][0])
            expect(historyPacket.type).toBe('TELEMETRY_HISTORY')
            expect(historyPacket.payload.items[0].ascii).toBe('>> [FSM] Live 1')

            // socket1 MUST NOT have received the history packet intended for socket2
            expect(socket1.send).toHaveBeenCalledTimes(2)
        })
        it('rejects un-upgraded requests to RepoBotDO with HTTP 426', async () => {
            const doInstance = createRepoBotDO(mockCtx, mockEnv)
            const req = new Request('http://do/ws/telemetry', { method: 'GET' })
            const res = await doInstance.fetch(req)
            expect(res.status).toBe(426)
        })

        it('accepts valid WebSocket upgrade with operator tag and serializes attachment metadata', async () => {
            const doInstance = createRepoBotDO(mockCtx, mockEnv)
            const req = new Request('http://do/ws/telemetry?role=operator', {
                method: 'GET',
                headers: { Upgrade: 'websocket' },
            })

            const res = await doInstance.fetch(req)
            expect(res.status).toBe(101)
            expect(res.webSocket).toBeDefined()

            expect(mockCtx.acceptWebSocket).toHaveBeenCalledTimes(1)
            const [acceptedServerWs, tags] =
                mockCtx.acceptWebSocket.mock.calls[0]
            expect(tags).toEqual(['operator'])
            expect(acceptedServerWs).toBeDefined()

            const attachment = acceptedServerWs.deserializeAttachment()
            expect(attachment).toBeDefined()
            expect(attachment.role).toBe('operator')
            expect(typeof attachment.connectedAt).toBe('number')
        })
    })

    describe('3. Monotonic Sequence Stamping & Pure ASCII Formatting', () => {
        it('broadcastTelemetry increments sequence monotonically (seq: 1 -> 2) and sends clean ASCII', async () => {
            const doInstance = createRepoBotDO(mockCtx, mockEnv)

            const mockWs = {
                _tags: ['operator'],
                send: vi.fn(),
                close: vi.fn(),
            }
            registeredWebSockets.push(mockWs)

            // Packet 1
            await doInstance.broadcastTelemetry(
                'HEARTBEAT',
                'RepoBotDO',
                { status: 'OK' },
                '>> [TELEMETRY] Heartbeat beacon verified.',
            )

            expect(mockWs.send).toHaveBeenCalledTimes(1)
            const packet1: TelemetryPacket = JSON.parse(
                mockWs.send.mock.calls[0][0],
            )
            expect(packet1.seq).toBe(1)
            expect(packet1.type).toBe('HEARTBEAT')
            expect(packet1.source).toBe('RepoBotDO')
            expect(packet1.ascii).toBe(
                '>> [TELEMETRY] Heartbeat beacon verified.',
            )
            // ASCII purity check: zero emojis
            expect(packet1.ascii).toMatch(/^[\x20-\x7E]+$/)

            // Packet 2
            await doInstance.broadcastTelemetry(
                'TASK_TRANSITION',
                'RepoBotDO',
                { taskId: 'TASK-01', state: 'VERIFYING' },
                '>> [FSM] Task TASK-01 state transition: INIT -> VERIFYING',
            )

            expect(mockWs.send).toHaveBeenCalledTimes(2)
            const packet2: TelemetryPacket = JSON.parse(
                mockWs.send.mock.calls[1][0],
            )
            expect(packet2.seq).toBe(2)
            expect(packet2.type).toBe('TASK_TRANSITION')
            expect(packet2.ascii).toBe(
                '>> [FSM] Task TASK-01 state transition: INIT -> VERIFYING',
            )
            expect(packet2.ascii).toMatch(/^[\x20-\x7E]+$/)
        })
    })

    describe('4. Hibernation Callbacks (PING/PONG, Close, Error)', () => {
        it('responds to raw PING message with JSON PONG frame', async () => {
            const doInstance = createRepoBotDO(mockCtx, mockEnv)
            const mockWs = {
                send: vi.fn(),
                close: vi.fn(),
            }

            await doInstance.webSocketMessage(mockWs as any, 'PING')
            expect(mockWs.send).toHaveBeenCalledTimes(1)
            const reply = JSON.parse(mockWs.send.mock.calls[0][0])
            expect(reply.type).toBe('PONG')
            expect(typeof reply.ts).toBe('number')
        })

        it('responds to JSON {"type":"PING"} message with JSON PONG frame', async () => {
            const doInstance = createRepoBotDO(mockCtx, mockEnv)
            const mockWs = {
                send: vi.fn(),
                close: vi.fn(),
            }

            await doInstance.webSocketMessage(
                mockWs as any,
                JSON.stringify({ type: 'PING' }),
            )
            expect(mockWs.send).toHaveBeenCalledTimes(1)
            const reply = JSON.parse(mockWs.send.mock.calls[0][0])
            expect(reply.type).toBe('PONG')
        })

        it('handles webSocketClose cleanly', async () => {
            const doInstance = createRepoBotDO(mockCtx, mockEnv)
            const mockWs = {
                send: vi.fn(),
                close: vi.fn(),
            }

            await doInstance.webSocketClose(
                mockWs as any,
                1000,
                'Normal Closure',
                true,
            )
            expect(mockWs.close).toHaveBeenCalledWith(1000, 'Normal Closure')
        })

        it('handles webSocketError with code 1011', async () => {
            const doInstance = createRepoBotDO(mockCtx, mockEnv)
            const mockWs = {
                send: vi.fn(),
                close: vi.fn(),
            }

            await doInstance.webSocketError(
                mockWs as any,
                new Error('Fatal socket failure'),
            )
            expect(mockWs.close).toHaveBeenCalledWith(1011, 'WebSocket error')
        })
    })

    describe('5. FSM Transition Hooking Telemetry Broadcast', () => {
        it('broadcasts TASK_TRANSITION frame when POST /fsm/transition triggers state change', async () => {
            const doInstance = createRepoBotDO(mockCtx, mockEnv)
            const broadcastSpy = vi.spyOn(doInstance, 'broadcastTelemetry')

            const transitionReq = new Request('http://do/fsm/transition', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    taskId: 'TASK-23',
                    type: 'QUALITY_PASS',
                }),
            })

            const res = await doInstance.fetch(transitionReq)
            expect(res.status).toBe(200)

            expect(broadcastSpy).toHaveBeenCalledWith(
                'TASK_TRANSITION',
                'RepoBotDO',
                expect.objectContaining({
                    taskId: 'TASK-23',
                }),
                expect.stringContaining('>> [FSM] Task TASK-23 transition:'),
            )
        })
    })
})
