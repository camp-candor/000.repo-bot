import { type CompactionCheckpoint } from '../ledger/ledgerCompactor.js'

export type TelemetryChannel = 'FLEET' | 'LEDGER' | 'COMPACTION' | 'ALERT'

export interface TelemetrySubscriber {
    id: string
    url: string
    channels: TelemetryChannel[]
    secret?: string
}

export interface TelemetryFrame {
    frameId: string
    channel: TelemetryChannel
    timestampMs: number
    payload: Record<string, any>
    formattedText: string
}

export interface BroadcastReceipt {
    frameId: string
    channel: TelemetryChannel
    dispatchedCount: number
    failedCount: number
    timestampMs: number
}

export const BROADCAST_TIMEOUT_MS = 2000

export function formatCompactionBroadcast(
    checkpoint: CompactionCheckpoint,
): string {
    const summaryLines = Object.entries(checkpoint.eventSummary)
        .map(([event, count]) => `  * ${event.padEnd(24)}: ${count}`)
        .join('\n')

    return [
        '```text',
        '================================================================================',
        '>> [TELEMETRY:COMPACTION] CRYPTOGRAPHIC LEDGER CHECKPOINT COMMITTED',
        '================================================================================',
        `CHECKPOINT ID:  ${checkpoint.checkpointIndex}`,
        `COMPACTED THRU: Block Index ${checkpoint.compactedThroughIndex}`,
        `TOTAL PRUNED:   ${checkpoint.prunedBlockCount} blocks`,
        `CHECKPOINT HASH:${checkpoint.checkpointHash}`,
        `MERKLE ROOT:    ${checkpoint.merkleRoot}`,
        '--------------------------------------------------------------------------------',
        'EVENT ROLLUP SUMMARY:',
        summaryLines.length > 0 ? summaryLines : '  (No events recorded)',
        'STATUS:         HISTORICAL TAIL PRUNED :: INTEGRITY ANCHORED [OK]',
        '================================================================================',
        '```',
    ].join('\n')
}

export function formatGenericTelemetryFrame(
    channel: TelemetryChannel,
    payload: Record<string, any>,
): string {
    const lines = Object.entries(payload)
        .map(
            ([k, v]) =>
                `  ${k.padEnd(16)}: ${typeof v === 'object' ? JSON.stringify(v) : v}`,
        )
        .join('\n')

    return [
        '```text',
        '================================================================================',
        `>> [TELEMETRY:${channel}] EVENT BROADCAST DISPATCH`,
        '================================================================================',
        lines,
        '================================================================================',
        '```',
    ].join('\n')
}

export class TelemetryBroadcaster {
    private subscribers: Map<string, TelemetrySubscriber> = new Map()

    public registerSubscriber(subscriber: TelemetrySubscriber): void {
        this.subscribers.set(subscriber.id, subscriber)
        console.log(
            `>> [BROADCAST:SUBSCRIBE] Registered subscriber '${subscriber.id}' for channels: [${subscriber.channels.join(', ')}] [OK]`,
        )
    }

    public removeSubscriber(subscriberId: string): boolean {
        const existed = this.subscribers.delete(subscriberId)
        if (existed) {
            console.log(
                `>> [BROADCAST:UNSUBSCRIBE] Removed subscriber '${subscriberId}' [OK]`,
            )
        }
        return existed
    }

    public getSubscribers(): TelemetrySubscriber[] {
        return Array.from(this.subscribers.values())
    }

    /**
     * Broadcasts an event frame concurrently to all matching subscribers.
     */
    public async broadcast(
        channel: TelemetryChannel,
        payload: Record<string, any>,
        nowMs = Date.now(),
    ): Promise<BroadcastReceipt> {
        const frameId = `frame-${nowMs}-${Math.random().toString(36).substring(2, 8)}`
        const formattedText =
            channel === 'COMPACTION' && payload.checkpoint
                ? formatCompactionBroadcast(
                      payload.checkpoint as CompactionCheckpoint,
                  )
                : formatGenericTelemetryFrame(channel, payload)

        const frame: TelemetryFrame = {
            frameId,
            channel,
            timestampMs: nowMs,
            payload,
            formattedText,
        }

        const matching = Array.from(this.subscribers.values()).filter((s) =>
            s.channels.includes(channel),
        )

        let dispatchedCount = 0
        let failedCount = 0

        await Promise.all(
            matching.map(async (sub) => {
                const controller = new AbortController()
                const timer = setTimeout(
                    () => controller.abort(),
                    BROADCAST_TIMEOUT_MS,
                )

                try {
                    const res = await fetch(sub.url, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'User-Agent': '000.repo-bot-broadcaster',
                            'x-telemetry-channel': channel,
                            'x-telemetry-frame-id': frameId,
                        },
                        body: JSON.stringify({
                            ...frame,
                            text: frame.formattedText,
                        }),
                        signal: controller.signal,
                    })

                    clearTimeout(timer)
                    if (res.ok) {
                        dispatchedCount += 1
                    } else {
                        failedCount += 1
                        console.warn(
                            `>> [BROADCAST:WARN] Subscriber '${sub.id}' returned HTTP ${res.status}`,
                        )
                    }
                } catch (err: any) {
                    clearTimeout(timer)
                    failedCount += 1
                    console.warn(
                        `>> [BROADCAST:FAIL] Subscriber '${sub.id}' dispatch failed: ${err.message}`,
                    )
                }
            }),
        )

        console.log(
            `>> [BROADCAST:COMPLETE] Frame '${frameId}' (${channel}) sent to ${dispatchedCount} targets (${failedCount} failed) [OK]`,
        )

        return {
            frameId,
            channel,
            dispatchedCount,
            failedCount,
            timestampMs: nowMs,
        }
    }
}
