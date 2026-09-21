import { describe, test, expect } from 'vitest'
import { request } from 'playwright-core'
import { TARGET_URL } from './config.js'

describe(`Mandate 4: Audit (${TARGET_URL})`, () => {
    let sessionId: string | null = null

    // --- Health Check ---
    test('Service is online', async () => {
        const api = await request.newContext({ baseURL: TARGET_URL })
        const response = await api.get('/')
        expect(response.ok()).toBe(true)
        const body = await response.text()
        expect(body).toContain('ACTIVE')
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
