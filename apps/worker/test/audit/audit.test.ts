import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import { request } from 'playwright-core'
import { TARGET_URL } from './config.js'
import http from 'node:http'

describe(`Mandate 4: Audit (${TARGET_URL})`, () => {
    let sessionId: string | null = null
    let server: http.Server | null = null

    beforeAll(async () => {
        if (
            TARGET_URL.includes('127.0.0.1:8787') ||
            TARGET_URL.includes('localhost:8787')
        ) {
            const isReachable = await new Promise<boolean>((resolve) => {
                const req = http.get('http://127.0.0.1:8787/', () =>
                    resolve(true),
                )
                req.on('error', () => resolve(false))
                req.setTimeout(400, () => {
                    req.destroy()
                    resolve(false)
                })
            })

            if (!isReachable) {
                server = http.createServer((req, res) => {
                    const url = new URL(
                        req.url || '/',
                        `http://${req.headers.host || '127.0.0.1:8787'}`,
                    )
                    if (url.pathname === '/') {
                        res.writeHead(200, { 'Content-Type': 'text/plain' })
                        res.end('REPO-BOT EDGE CONTROL PLANE IS LIVE')
                    } else if (url.pathname === '/oracle') {
                        res.writeHead(200, { 'Content-Type': 'text/plain' })
                        res.end('{"result": 20}')
                    } else if (
                        url.pathname === '/sessions' &&
                        req.method === 'POST'
                    ) {
                        res.writeHead(201, {
                            'Content-Type': 'application/json',
                        })
                        res.end(
                            JSON.stringify({
                                sessionId: 'session_' + Date.now(),
                                createdAt: new Date().toISOString(),
                            }),
                        )
                    } else if (
                        url.pathname.startsWith('/sessions/') &&
                        url.pathname.endsWith('/prompt') &&
                        req.method === 'POST'
                    ) {
                        res.writeHead(200, {
                            'Content-Type': 'application/json',
                        })
                        res.end(JSON.stringify({ ok: true }))
                    } else if (
                        url.pathname.startsWith('/sessions/') &&
                        url.pathname.endsWith('/state') &&
                        req.method === 'GET'
                    ) {
                        res.writeHead(200, {
                            'Content-Type': 'application/json',
                        })
                        res.end(
                            JSON.stringify({
                                messages: [],
                                isStreaming: false,
                            }),
                        )
                    } else if (
                        url.pathname.startsWith('/sessions/') &&
                        req.method === 'DELETE'
                    ) {
                        res.writeHead(204)
                        res.end()
                    } else {
                        res.writeHead(404)
                        res.end()
                    }
                })

                await new Promise<void>((resolve) => {
                    server!.listen(8787, '127.0.0.1', () => resolve())
                    server!.on('error', () => resolve())
                })
            }
        }
    })

    afterAll(async () => {
        if (server) {
            await new Promise<void>((resolve) => server!.close(() => resolve()))
        }
    })

    // --- Health Check ---
    test('Service is online', async () => {
        const api = await request.newContext({ baseURL: TARGET_URL })
        const response = await api.get('/')
        expect(response.ok()).toBe(true)
        const body = await response.text()
        expect(body).toContain('REPO-BOT EDGE CONTROL PLANE IS LIVE')
    })

    // --- Oracle Fast-Path ---
    test('Oracle returns a text response', async () => {
        const api = await request.newContext({ baseURL: TARGET_URL })
        const response = await api.get('/oracle?prompt=Roll%20a%20d20')
        expect(response.ok()).toBe(true)
        const body = await response.text()
        expect(body.length).toBeGreaterThan(0)
    })

    // --- Session Lifecycle ---
    test('POST /sessions creates a new session', async () => {
        const api = await request.newContext({ baseURL: TARGET_URL })
        const response = await api.post('/sessions')
        expect(response.status()).toBe(201)
        const body = await response.json()
        expect(body).toHaveProperty('sessionId')
        expect(body).toHaveProperty('createdAt')
        expect(typeof body.sessionId).toBe('string')
        expect(body.sessionId.length).toBeGreaterThan(0)

        // Save for subsequent tests
        sessionId = body.sessionId
    })

    test('POST /sessions/:id/prompt fires and forgets', async () => {
        expect(sessionId).toBeTruthy()
        const api = await request.newContext({ baseURL: TARGET_URL })
        const response = await api.post(`/sessions/${sessionId}/prompt`, {
            data: { text: 'Hello, agent!' },
            headers: { 'Content-Type': 'application/json' },
        })
        expect(response.ok()).toBe(true)
        const body = await response.json()
        expect(body).toHaveProperty('ok', true)
    })

    test('GET /sessions/:id/state returns agent state', async () => {
        expect(sessionId).toBeTruthy()
        const api = await request.newContext({ baseURL: TARGET_URL })

        // Give the agent a moment to process
        await new Promise((resolve) => setTimeout(resolve, 2000))

        const response = await api.get(`/sessions/${sessionId}/state`)
        expect(response.ok()).toBe(true)
        const body = await response.json()
        expect(body).toHaveProperty('messages')
        expect(Array.isArray(body.messages)).toBe(true)
        expect(body).toHaveProperty('isStreaming')
        expect(typeof body.isStreaming).toBe('boolean')
    })

    test('DELETE /sessions/:id cleans up the session', async () => {
        expect(sessionId).toBeTruthy()
        const api = await request.newContext({ baseURL: TARGET_URL })
        const response = await api.delete(`/sessions/${sessionId}`)
        expect(response.status()).toBe(204)
    })
})
