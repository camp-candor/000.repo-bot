import type Console from './fce/console.interface'
import type { TelemetryFrame, RingBufferQuery, RingBufferStats } from './fce/ring-buffer.interface'

export class ConsoleRingBuffer {
    public readonly capacity: number
    private buffer: Array<TelemetryFrame | null>
    private head: number = 0
    private count: number = 0
    private sequence: number = 0

    constructor(capacity: number = 10000) {
        this.capacity = Math.max(1, capacity)
        this.buffer = new Array(this.capacity).fill(null)
    }

    public push(rawText: string, metadata?: Partial<TelemetryFrame>): TelemetryFrame {
        this.sequence++
        const clean = rawText.replace(/[^\x20-\x7E]/g, '').trim()
        const frame: TelemetryFrame = {
            id: this.sequence,
            timestamp: new Date().toISOString(),
            raw: rawText,
            clean,
            repo: metadata?.repo,
            stage: metadata?.stage,
            status: metadata?.status,
        }

        this.buffer[this.head] = frame
        this.head = (this.head + 1) % this.capacity
        if (this.count < this.capacity) {
            this.count++
        }

        return frame
    }

    public toArray(): TelemetryFrame[] {
        if (this.count === 0) return []
        if (this.count < this.capacity) {
            return this.buffer.slice(0, this.count) as TelemetryFrame[]
        }
        const tail = this.head
        const part1 = this.buffer.slice(tail) as TelemetryFrame[]
        const part2 = this.buffer.slice(0, tail) as TelemetryFrame[]
        return part1.concat(part2)
    }

    public filter(query: RingBufferQuery): TelemetryFrame[] {
        const frames = this.toArray()
        const limit = query.limit && query.limit > 0 ? query.limit : frames.length

        const results: TelemetryFrame[] = []
        for (let i = frames.length - 1; i >= 0 && results.length < limit; i--) {
            const frame = frames[i]
            if (query.repo && frame.repo !== query.repo) continue
            if (query.stage && frame.stage !== query.stage) continue
            if (query.status && frame.status !== query.status) continue
            if (query.query && !frame.clean.toLowerCase().includes(query.query.toLowerCase())) continue
            results.push(frame)
        }

        return results.reverse()
    }

    public getStats(): RingBufferStats {
        return {
            capacity: this.capacity,
            size: this.count,
            head: this.head,
            totalIngested: this.sequence,
        }
    }

    public clear(): void {
        this.buffer.fill(null)
        this.head = 0
        this.count = 0
    }
}

export class ConsoleModel implements Console {
    ring = new ConsoleRingBuffer(10000)
    activeFilter: RingBufferQuery = {}
}
