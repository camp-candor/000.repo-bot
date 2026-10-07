export interface ExecutionJob {
    taskId: string
    artistId: string
    idempotencyKey: string
    workflowTemplate: string
    prompts: {
        positive?: string
        negative?: string
        denoiseStrength?: number
        [key: string]: any
    }
    seeds: number[]
    enqueuedAt: number
    attemptCount: number
    maxAttempts: number
}

export class FairQueue {
    private queue: ExecutionJob[] = []

    constructor(initialState: ExecutionJob[] = []) {
        this.queue = [...initialState]
    }

    /**
     * Enqueues a job at the back of the line. Returns false if duplicate taskId.
     */
    public enqueue(job: ExecutionJob): boolean {
        if (this.queue.some((j) => j.taskId === job.taskId)) {
            return false
        }
        this.queue.push(job)
        return true
    }

    /**
     * Inserts a mutated or intervened job at the front of the queue for priority processing.
     */
    public requeuePriority(job: ExecutionJob): void {
        this.remove(job.taskId)
        this.queue.unshift(job)
    }

    /**
     * Standard requeue at the back (e.g., automated progressive escalation retry).
     */
    public requeue(job: ExecutionJob): void {
        this.remove(job.taskId)
        this.queue.push(job)
    }

    /**
     * Removes a specific task from the queue by ID.
     */
    public remove(taskId: string): boolean {
        const initialLength = this.queue.length
        this.queue = this.queue.filter((j) => j.taskId !== taskId)
        return this.queue.length < initialLength
    }

    /**
     * Dequeues the next job, prioritizing round-robin fairness across artists.
     */
    public dequeueNextFair(lastArtistId: string | null): ExecutionJob | null {
        if (this.queue.length === 0) {
            return null
        }

        // Attempt to find a task from a different artist to prevent starvation
        if (lastArtistId) {
            const fairIndex = this.queue.findIndex(
                (j) => j.artistId !== lastArtistId,
            )
            if (fairIndex !== -1) {
                const [fairJob] = this.queue.splice(fairIndex, 1)
                return fairJob
            }
        }

        // Fallback to strict FIFO if only one artist is queued
        return this.queue.shift() || null
    }

    public size(): number {
        return this.queue.length
    }

    public toArray(): ExecutionJob[] {
        return [...this.queue]
    }
}
