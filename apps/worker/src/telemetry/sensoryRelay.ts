export type TelemetryRole = 'operator' | 'artist' | 'broker'

export interface SensoryPacket {
    type: string
    source: string
    timestampMs?: number
    payload: Record<string, any>
    ascii?: string
}

export interface TelemetryEnvelope extends SensoryPacket {
    seq: number
    timestampMs: number
}

export interface HistoricalReplayEnvelope {
    type: 'TELEMETRY_HISTORY'
    seq: number
    payload: {
        items: TelemetryEnvelope[]
    }
}

export const MAX_RING_BUFFER_SIZE = 50

/**
 * Validates and sanitizes the requested WebSocket role tag.
 */
export function sanitizeRoleTag(roleParam: string | null): TelemetryRole {
    if (roleParam === 'artist') return 'artist'
    if (roleParam === 'broker') return 'broker'
    return 'operator'
}
