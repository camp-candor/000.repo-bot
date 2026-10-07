export interface ExecutionJob {
    taskId: string
    artistId: string
    idempotencyKey: string
    workflowTemplate: string
    prompts: Record<string, any>
    seeds: number[]
    enqueuedAt: number
    attemptCount: number
    maxAttempts: number
    priority?: number
    isHighRisk?: boolean
}

export class FairQueue {
    private queue: ExecutionJob[] = []
    private knownKeys: Set<string> = new Set()

    constructor(initialJobs: ExecutionJob[] = []) {
        for (const job of initialJobs) {
            this.enqueue(job)
        }
    }

    /**
     * Enqueues a task while rejecting duplicate idempotency keys or task IDs.
     */
    public enqueue(job: ExecutionJob): boolean {
        if (
            this.knownKeys.has(job.idempotencyKey) ||
            this.knownKeys.has(job.taskId)
        ) {
            console.log(
                `>> [QUEUE:DUP] Rejected duplicate task submission '${job.taskId}' [SKIP]`,
            )
            return false
        }

        this.knownKeys.add(job.idempotencyKey)
        this.knownKeys.add(job.taskId)
        this.queue.push({ ...job })
        console.log(
            `>> [QUEUE:INGRESS] Enqueued task '${job.taskId}' for artist '${job.artistId}' (Depth: ${this.queue.length}) [OK]`,
        )
        return true
    }

    /**
     * Re-inserts a failed job during transient retry without idempotency rejection.
     */
    public requeue(job: ExecutionJob): void {
        this.knownKeys.add(job.idempotencyKey)
        this.knownKeys.add(job.taskId)
        this.queue.unshift({ ...job })
        console.log(
            `>> [QUEUE:REQUEUE] Re-queued task '${job.taskId}' (Attempt: ${job.attemptCount}/${job.maxAttempts}) [OK]`,
        )
    }

    /**
     * Extracts the next fair job using tenant round-robin interleaving.
     * Prevents single-user batch starvation: [A, A, A, B] -> [A, B, A, A].
     */
    public dequeueNextFair(
        lastArtistId: string | null,
    ): ExecutionJob | undefined {
        if (this.queue.length === 0) {
            return undefined
        }

        // If no previous artist recorded, pull standard FIFO
        if (!lastArtistId) {
            const job = this.queue.shift()!
            this.knownKeys.delete(job.idempotencyKey)
            this.knownKeys.delete(job.taskId)
            return job
        }

        // Scan for the first job belonging to an alternate tenant
        const alternateIndex = this.queue.findIndex(
            (j) => j.artistId !== lastArtistId,
        )

        if (alternateIndex !== -1) {
            const job = this.queue.splice(alternateIndex, 1)[0]
            this.knownKeys.delete(job.idempotencyKey)
            this.knownKeys.delete(job.taskId)
            console.log(
                `>> [QUEUE:FAIR] Interleaved artist '${job.artistId}' ahead of repetitive tenant '${lastArtistId}' [OK]`,
            )
            return job
        }

        // Fallback to sequential FIFO when queue contains only one active tenant
        const job = this.queue.shift()!
        this.knownKeys.delete(job.idempotencyKey)
        this.knownKeys.delete(job.taskId)
        return job
    }

    public size(): number {
        return this.queue.length
    }

    public peek(): ExecutionJob | undefined {
        return this.queue[0]
    }

    public toArray(): ExecutionJob[] {
        return this.queue.map((j) => ({ ...j }))
    }

    public clear(): void {
        this.queue = []
        this.knownKeys.clear()
    }
}
