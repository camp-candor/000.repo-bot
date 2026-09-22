import { DurableObject } from 'cloudflare:workers'
import type { Env } from './tools.js'

export class RepoBotDO extends DurableObject {
    constructor(ctx: DurableObjectState, env: Env) {
        super(ctx, env)
    }

    async fetch(_request: Request): Promise<Response> {
        return new Response(JSON.stringify({ status: 'REPO_BOT_DO_ONLINE' }), {
            headers: { 'Content-Type': 'application/json' },
        })
    }
}
