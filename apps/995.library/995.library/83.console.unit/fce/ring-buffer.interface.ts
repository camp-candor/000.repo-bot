export interface TelemetryFrame {
    id: number
    timestamp: string
    raw: string
    clean: string
    repo?: string
    stage?: string
    status?: string
}

export interface RingBufferQuery {
    repo?: string
    stage?: string
    status?: string
    query?: string
    limit?: number
}

export interface RingBufferStats {
    capacity: number
    size: number
    head: number
    totalIngested: number
}
