import { describe, test, expect } from 'vitest'
import { request } from 'playwright-core'
import { TARGET_URL } from './config.js'

describe(`Mandate 4: Audit (${TARGET_URL})`, () => {
    test('Service is online', async () => {
        const api = await request.newContext({ baseURL: TARGET_URL })
        const response = await api.get('/')
        expect(response.ok()).toBe(true)
        const body = await response.text()
        expect(body).toContain('REPO-BOT EDGE CONTROL PLANE IS LIVE')
    })

    test('/health returns structured status', async () => {
        const api = await request.newContext({ baseURL: TARGET_URL })
        const response = await api.get('/health')
        expect(response.ok()).toBe(true)
        const body = await response.json()
        expect(body).toHaveProperty('status', 'healthy')
        expect(body).toHaveProperty('hasGithubToken')
    })

    test('POST /api/commit-message rejects empty request', async () => {
        const api = await request.newContext({ baseURL: TARGET_URL })
        const response = await api.post('/api/commit-message', {
            data: {},
            headers: { 'Content-Type': 'application/json' },
        })
        expect(response.status()).toBe(400)
        const body = await response.json()
        expect(body).toHaveProperty('error')
    })

    test('POST /webhooks/github receives event', async () => {
        const api = await request.newContext({ baseURL: TARGET_URL })
        const payload = { action: 'ping' }
        const secret =
            process.env.GH_WEBHOOK_SECRET || process.env.GITHUB_WEBHOOK_SECRET

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'X-GitHub-Event': 'ping',
            'X-GitHub-Delivery': 'del_123',
        }

        if (secret) {
            const { createHmac } = await import('node:crypto')
            headers['X-Hub-Signature-256'] = `sha256=${createHmac(
                'sha256',
                secret,
            )
                .update(JSON.stringify(payload))
                .digest('hex')}`
        }

        const response = await api.post('/webhooks/github', {
            data: payload,
            headers,
        })
        expect([200, 202]).toContain(response.status())
        const body = await response.json()
        expect(['RECEIVED', 'ACCEPTED']).toContain(body.status)
    })
})
