import type { Context } from 'hono'
import type { Env } from './tools.js'

export const handleGitHubWebhook = async (c: Context<{ Bindings: Env }>) => {
    const signature = c.req.header('X-Hub-Signature-256')
    const event = c.req.header('X-GitHub-Event')
    const deliveryId = c.req.header('X-GitHub-Delivery')

    if (c.env.GITHUB_WEBHOOK_SECRET) {
        if (!signature) {
            return c.json({ error: 'MISSING_SIGNATURE' }, 401)
        }

        const bodyBuffer = await c.req.arrayBuffer()
        const encoder = new TextEncoder()
        const key = await crypto.subtle.importKey(
            'raw',
            encoder.encode(c.env.GITHUB_WEBHOOK_SECRET),
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['verify'],
        )

        const sigHex = signature.startsWith('sha256=')
            ? signature.slice(7)
            : signature
        const sigBytes = new Uint8Array(
            sigHex.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || [],
        )

        const isValid = await crypto.subtle.verify(
            'HMAC',
            key,
            sigBytes,
            bodyBuffer,
        )

        if (!isValid) {
            return c.json({ error: 'INVALID_SIGNATURE' }, 401)
        }

        return c.json({ status: 'ACCEPTED', event, deliveryId }, 202)
    }

    return c.json({ status: 'RECEIVED', event, deliveryId }, 200)
}
