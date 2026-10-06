import { canonicalizeJson } from '../audit/canonicalJson.js'
import { sha256Hex } from '../audit/hashChain.js'
import { redactSensitiveData } from '../audit/redaction.js'
import type { Env } from '../tools.js'
import {
    CURRENT_SCHEMA_VERSIONS,
    sanitizeToAscii,
    type CanonicalEventType,
    type EventDomain,
    type EventEnvelope,
} from './eventEnvelope.js'
import { defaultUpcasterRegistry, EventUpcasterRegistry } from './upcasters.js'

export interface PublishEventOptions<T = any> {
    domain: EventDomain
    type: CanonicalEventType
    source: string
    correlationId?: string
    payload: T
    ascii: string
}

export class EventHub {
    constructor(
        private readonly env: Env,
        readonly upcasters: EventUpcasterRegistry = defaultUpcasterRegistry,
    ) {}

    async publish<T = any>(
        options: PublishEventOptions<T>,
    ): Promise<EventEnvelope> {
        const cleanAscii = sanitizeToAscii(options.ascii)
        const redactedPayloadStr = redactSensitiveData(
            JSON.stringify(options.payload || {}),
        )
        const cleanPayload = JSON.parse(redactedPayloadStr)

        const now = Date.now()
        const correlationId =
            options.correlationId ||
            `corr-${now}-${Math.random().toString(36).slice(2, 8)}`
        const eventId = `evt-${now}-${Math.random().toString(36).slice(2, 10)}`

        let seq = 1
        let prevHash =
            '0000000000000000000000000000000000000000000000000000000000000000'

        // 1. Resolve sequence and prevHash from D1 if available
        if (this.env.DB) {
            try {
                const maxRow = await this.env.DB.prepare(
                    'SELECT sequence_id, record_hash FROM audit_events ORDER BY sequence_id DESC LIMIT 1',
                ).first()
                if (maxRow) {
                    seq = (Number(maxRow.sequence_id) || 0) + 1
                    prevHash = String(maxRow.record_hash || prevHash)
                }
            } catch {}
        }

        // 2. Canonical JSON & SHA-256 Hash Chaining
        const canonicalBody = canonicalizeJson({
            seq,
            domain: options.domain,
            type: options.type,
            source: options.source,
            correlationId,
            payload: cleanPayload,
            ts: now,
        })
        const recordHash = await sha256Hex(`${prevHash}${canonicalBody}`)

        const version = CURRENT_SCHEMA_VERSIONS[options.type] || 1

        const envelope: EventEnvelope = {
            id: eventId,
            seq,
            tick: now,
            ts: now,
            version,
            domain: options.domain,
            type: options.type,
            source: options.source,
            correlationId,
            prevHash,
            recordHash,
            payload: cleanPayload,
            ascii: cleanAscii,
        }

        // 3. Persist to D1 Hot Ledger
        if (this.env.DB) {
            this.env.DB.prepare(
                `INSERT INTO audit_events
                (sequence_id, task_id, repository, event_type, actor_id, head_sha, payload_json, prev_hash, record_hash, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
                .bind(
                    seq,
                    correlationId,
                    options.source,
                    options.type,
                    options.source,
                    'HEAD',
                    canonicalBody,
                    prevHash,
                    recordHash,
                    now,
                )
                .run()
                .catch(() => {})
        }

        // 4. Broadcast through RepoBotDO Singleton
        if (this.env.REPO_BOT_DO) {
            try {
                const id = this.env.REPO_BOT_DO.idFromName('global')
                const stub = this.env.REPO_BOT_DO.get(id)
                await stub.fetch(
                    new Request('https://internal/broadcast', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(envelope),
                    }),
                )
            } catch {}
        }

        return envelope
    }
}

/**
 * Top-level convenience dispatcher for edge route handlers.
 */
export async function emitCanonicalEvent(
    env: Env,
    options: PublishEventOptions,
): Promise<EventEnvelope> {
    const hub = new EventHub(env)
    return hub.publish(options)
}
