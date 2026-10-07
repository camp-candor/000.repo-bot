import { FairQueue, type ExecutionJob } from '../queue/fairQueue.js'
import {
    validateStagingKey,
    buildCanonicalKey,
    type CanonicalManifestEntry,
} from '../storage/r2Promotion.js'

export interface DlqRecord {
    taskId: string
    artistId: string
    attemptCount: number
    quarantinedAt: number
    errorTrajectoryVector: {
        domain: string
        targetEntity: string
        ruleId: string
        offendingTokens: string
    }
    lastHeartbeatMetrics?: Record<string, any>
}

export interface ActiveLeaseSnapshot {
    taskId: string
    artistId: string
    epoch: number
    dispatchedAt: number
    leaseExpiresAt: number
    workerId: string
}

export class ShotCoordinatorDO {
    private fairQueue = new FairQueue()
    private activeJob: ExecutionJob | null = null
    private activeLease: ActiveLeaseSnapshot | null = null
    private lastArtistId: string | null = null
    private currentEpoch = 0
    private dlqRecords: Map<string, DlqRecord> = new Map()
    private canonicalManifests: Map<string, CanonicalManifestEntry> = new Map()

    constructor(private ctx: any) {
        this.ctx.blockConcurrencyWhile?.(async () => {
            const queueData = await this.ctx.storage.get('pending_queue')
            if (Array.isArray(queueData)) {
                this.fairQueue = new FairQueue(queueData)
            }

            const activeJobData = await this.ctx.storage.get('active_job')
            if (activeJobData && typeof activeJobData === 'object') {
                this.activeJob = activeJobData
            }

            const leaseData = await this.ctx.storage.get('active_lease')
            if (leaseData && typeof leaseData === 'object') {
                this.activeLease = leaseData
            }

            const storedEpoch = await this.ctx.storage.get('current_epoch')
            if (typeof storedEpoch === 'number') {
                this.currentEpoch = storedEpoch
            }

            const storedLastArtist =
                await this.ctx.storage.get('last_artist_id')
            if (typeof storedLastArtist === 'string') {
                this.lastArtistId = storedLastArtist
            }

            const storedDlq = await this.ctx.storage.get('dlq_records')
            if (storedDlq && typeof storedDlq === 'object') {
                this.dlqRecords = new Map(Object.entries(storedDlq))
            }

            const storedManifests = await this.ctx.storage.get(
                'canonical_manifests',
            )
            if (storedManifests && typeof storedManifests === 'object') {
                this.canonicalManifests = new Map(
                    Object.entries(storedManifests),
                )
            }

            console.log(
                `>> [DO:BOOT] ShotCoordinatorDO rehydrated. Epoch: ${this.currentEpoch}, Queue Depth: ${this.fairQueue.size()} [OK]`,
            )
        })
    }

    /**
     * Hardware Watchdog Alarm Handler: Evaluates failure triage on lease expiration.
     */
    async alarm(): Promise<void> {
        console.warn(
            `>> [WATCHDOG:TRIP] Hardware alarm fired for task '${this.activeJob?.taskId || 'NONE'}' [ALERT]`,
        )

        if (!this.activeJob) {
            await this.ctx.storage.deleteAlarm()
            return
        }

        const task = this.activeJob
        task.attemptCount += 1

        // Bump monotonic epoch to immediately fence out active and partitioned zombie workers
        this.currentEpoch += 1

        if (task.attemptCount < task.maxAttempts) {
            // Triage Branch 1: Transient Infrastructure Fault -> Re-queue with new epoch
            console.warn(
                `>> [WATCHDOG:RETRY] Transient failure on '${task.taskId}'. Attempt ${task.attemptCount}/${task.maxAttempts}. Bumped to Epoch ${this.currentEpoch} [RETRY]`,
            )
            this.fairQueue.requeue(task)
            this.activeJob = null
            this.activeLease = null
            await this.ctx.storage.deleteAlarm()
        } else {
            // Triage Branch 2: Deterministic Poison Task -> Escalate to DLQ
            console.error(
                `>> [DLQ:POISON] Task '${task.taskId}' exhausted ${task.maxAttempts} attempts. Moving to DLQ [HALT]`,
            )
            const dlqEntry: DlqRecord = {
                taskId: task.taskId,
                artistId: task.artistId,
                attemptCount: task.attemptCount,
                quarantinedAt: Date.now(),
                errorTrajectoryVector: {
                    domain: 'HARDWARE_WATCHDOG_TIMEOUT',
                    targetEntity: task.workflowTemplate,
                    ruleId: 'MAX_ATTEMPTS_EXHAUSTED',
                    offendingTokens: `taskId=${task.taskId};attempts=${task.attemptCount}`,
                },
            }

            this.dlqRecords.set(task.taskId, dlqEntry)
            this.activeJob = null
            this.activeLease = null
            await this.ctx.storage.deleteAlarm()
        }

        await this.persistState()
    }

    /**
     * Edge Router Dispatch Interface.
     */
    async fetch(request: Request): Promise<Response> {
        const url = new URL(request.url)

        try {
            // 1. Task Enqueue Route (Artists & Conductor Ingress)
            if (
                request.method === 'POST' &&
                url.pathname.endsWith('/enqueue')
            ) {
                const body = (await request.json().catch(() => ({}))) as any
                const {
                    taskId,
                    artistId,
                    idempotencyKey,
                    workflowTemplate = 'default.json',
                    prompts = {},
                    seeds = [42],
                    maxAttempts = 2,
                    priority = 0,
                    isHighRisk = false,
                } = body

                if (!taskId || !artistId || !idempotencyKey) {
                    return new Response(
                        JSON.stringify({ error: 'MISSING_REQUIRED_FIELDS' }),
                        {
                            status: 400,
                            headers: { 'Content-Type': 'application/json' },
                        },
                    )
                }

                // Check active job for idempotency collision
                if (
                    this.activeJob &&
                    (this.activeJob.idempotencyKey === idempotencyKey ||
                        this.activeJob.taskId === taskId)
                ) {
                    return new Response(
                        JSON.stringify({ error: 'TASK_ALREADY_ACTIVE' }),
                        {
                            status: 409,
                            headers: { 'Content-Type': 'application/json' },
                        },
                    )
                }

                const job: ExecutionJob = {
                    taskId,
                    artistId,
                    idempotencyKey,
                    workflowTemplate,
                    prompts,
                    seeds,
                    enqueuedAt: Date.now(),
                    attemptCount: 0,
                    maxAttempts,
                    priority,
                    isHighRisk,
                }

                const enqueued = this.fairQueue.enqueue(job)
                if (!enqueued) {
                    return new Response(
                        JSON.stringify({ error: 'DUPLICATE_TASK_REJECTED' }),
                        {
                            status: 409,
                            headers: { 'Content-Type': 'application/json' },
                        },
                    )
                }

                await this.persistState()

                return new Response(
                    JSON.stringify({
                        ok: true,
                        taskId: job.taskId,
                        position: this.fairQueue.size(),
                        depth: this.fairQueue.size(),
                    }),
                    {
                        status: 200,
                        headers: { 'Content-Type': 'application/json' },
                    },
                )
            }

            // 2. Lease Claim Route (Rig 2 media-broker Pull Ingress)
            if (
                request.method === 'POST' &&
                url.pathname.endsWith('/leases/claim')
            ) {
                const body = (await request.json().catch(() => ({}))) as any
                const workerId = body.workerId || 'rig2_gpu_foundry'

                // Hardware Mutex: Assert no job currently executing
                if (this.activeJob !== null) {
                    return new Response(
                        JSON.stringify({
                            ok: false,
                            busy: true,
                            message: 'GPU_OCCUPIED',
                        }),
                        {
                            status: 200,
                            headers: { 'Content-Type': 'application/json' },
                        },
                    )
                }

                // Extract next fair job using tenant round-robin interleaving
                const job = this.fairQueue.dequeueNextFair(this.lastArtistId)
                if (!job) {
                    return new Response(null, { status: 204 })
                }

                // Increment Monotonic Epoch (Epoch N -> N+1)
                this.currentEpoch += 1
                this.activeJob = job
                this.lastArtistId = job.artistId

                const leaseExpiresAt = Date.now() + 30_000
                this.activeLease = {
                    taskId: job.taskId,
                    artistId: job.artistId,
                    epoch: this.currentEpoch,
                    dispatchedAt: Date.now(),
                    leaseExpiresAt,
                    workerId,
                }

                // Arm autonomous 30s hardware storage alarm
                await this.ctx.storage.setAlarm(leaseExpiresAt)
                await this.persistState()

                console.log(
                    `>> [LEASE:GRANTED] Granted task '${job.taskId}' to '${workerId}' under Epoch ${this.currentEpoch} [OK]`,
                )

                return new Response(
                    JSON.stringify({
                        ok: true,
                        taskId: job.taskId,
                        artistId: job.artistId,
                        epoch: this.currentEpoch,
                        workflowTemplate: job.workflowTemplate,
                        prompts: job.prompts,
                        seeds: job.seeds,
                        leaseExpiresAt,
                    }),
                    {
                        status: 200,
                        headers: { 'Content-Type': 'application/json' },
                    },
                )
            }

            // 3. Heartbeat Route
            if (
                request.method === 'POST' &&
                url.pathname.endsWith('/leases/heartbeat')
            ) {
                const body = (await request.json().catch(() => ({}))) as any
                const { taskId, epoch } = body

                if (
                    !this.activeJob ||
                    !this.activeLease ||
                    this.activeJob.taskId !== taskId
                ) {
                    return new Response(
                        JSON.stringify({ error: 'TASK_NOT_ACTIVE' }),
                        {
                            status: 404,
                            headers: { 'Content-Type': 'application/json' },
                        },
                    )
                }

                // Epoch fencing check
                if (epoch !== this.currentEpoch) {
                    console.warn(
                        `>> [FENCE:HEARTBEAT] Stale epoch heartbeat rejected (${epoch} != ${this.currentEpoch}) [FAIL]`,
                    )
                    return new Response(
                        JSON.stringify({
                            error: `HTTP 409 Conflict: Stale Epoch ${epoch}. Active is ${this.currentEpoch}`,
                        }),
                        {
                            status: 409,
                            headers: { 'Content-Type': 'application/json' },
                        },
                    )
                }

                // Extend lease window and reschedule watchdog alarm
                const newExpiry = Date.now() + 30_000
                this.activeLease.leaseExpiresAt = newExpiry
                await this.ctx.storage.setAlarm(newExpiry)
                await this.persistState()

                return new Response(
                    JSON.stringify({
                        ok: true,
                        epoch: this.currentEpoch,
                        leaseExpiresAt: newExpiry,
                    }),
                    {
                        status: 200,
                        headers: { 'Content-Type': 'application/json' },
                    },
                )
            }

            // 4. Task Complete Route (Promotion Gate)
            if (
                request.method === 'POST' &&
                url.pathname.endsWith('/tasks/complete')
            ) {
                const body = (await request.json().catch(() => ({}))) as any
                const { taskId, epoch, stagingKey, metadata } = body

                // Idempotency Check: Safely accept duplicate calls caused by network blips
                if (this.canonicalManifests.has(taskId)) {
                    const manifest = this.canonicalManifests.get(taskId)!
                    if (
                        manifest.stagingKey === stagingKey &&
                        manifest.epoch === epoch
                    ) {
                        console.log(
                            `>> [PROMOTION:IDEMPOTENT] Replay request for already-promoted artifact '${stagingKey}' [OK]`,
                        )
                        return new Response(
                            JSON.stringify({
                                ok: true,
                                epoch: this.currentEpoch,
                                alreadyPromoted: true,
                                canonicalKey: manifest.canonicalKey,
                            }),
                            {
                                status: 200,
                                headers: { 'Content-Type': 'application/json' },
                            },
                        )
                    }
                }

                // Monotonic Fencing Token Check (Split-Brain Zombie Defense)
                if (epoch !== this.currentEpoch) {
                    console.warn(
                        `>> [ZOMBIE:REJECT] Stale write rejected for task '${taskId}' (Presented Epoch ${epoch} != ${this.currentEpoch}) [FAIL]`,
                    )
                    return new Response(
                        JSON.stringify({
                            error: `HTTP 409 Conflict: Stale Epoch ${epoch}. Active Epoch is ${this.currentEpoch}`,
                            fenced: true,
                        }),
                        {
                            status: 409,
                            headers: { 'Content-Type': 'application/json' },
                        },
                    )
                }

                if (!this.activeJob || this.activeJob.taskId !== taskId) {
                    return new Response(
                        JSON.stringify({ error: 'TASK_NOT_FOUND' }),
                        {
                            status: 404,
                            headers: { 'Content-Type': 'application/json' },
                        },
                    )
                }

                // Validate content-addressed staging key schema and task bounds
                let parsed
                try {
                    parsed = validateStagingKey(
                        stagingKey,
                        taskId,
                        this.currentEpoch,
                    )
                } catch (valErr: any) {
                    return new Response(
                        JSON.stringify({
                            error: valErr.message || 'MALFORMED_STAGING_KEY',
                        }),
                        {
                            status: 400,
                            headers: { 'Content-Type': 'application/json' },
                        },
                    )
                }

                // Construct canonical manifest entry
                const canonicalKey = buildCanonicalKey(
                    taskId,
                    parsed.sha256,
                    parsed.extension,
                )
                this.canonicalManifests.set(taskId, {
                    taskId,
                    epoch: this.currentEpoch,
                    stagingKey,
                    canonicalKey,
                    sha256: parsed.sha256,
                    workerId: this.activeLease?.workerId || 'UNKNOWN',
                    promotedAtMs: Date.now(),
                    metadata: metadata || {},
                })

                // Unconditionally delete hardware watchdog alarm on task completion
                await this.ctx.storage.deleteAlarm()

                console.log(
                    `>> [PROMOTION:OK] Successfully promoted '${stagingKey}' -> '${canonicalKey}' under Epoch ${this.currentEpoch} [OK]`,
                )
                this.activeJob = null
                this.activeLease = null
                await this.persistState()

                return new Response(
                    JSON.stringify({
                        ok: true,
                        taskId,
                        epoch: this.currentEpoch,
                        promoted: true,
                        canonicalKey,
                    }),
                    {
                        status: 200,
                        headers: { 'Content-Type': 'application/json' },
                    },
                )
            }

            // 5. Diagnostics & State Inspection Route
            if (request.method === 'GET' && url.pathname.endsWith('/state')) {
                return new Response(
                    JSON.stringify({
                        currentEpoch: this.currentEpoch,
                        queueDepth: this.fairQueue.size(),
                        activeJob: this.activeJob,
                        activeLease: this.activeLease,
                        lastArtistId: this.lastArtistId,
                        dlqCount: this.dlqRecords.size,
                        dlq: Object.fromEntries(this.dlqRecords),
                    }),
                    {
                        status: 200,
                        headers: { 'Content-Type': 'application/json' },
                    },
                )
            }

            return new Response('NOT_FOUND', { status: 404 })
        } catch (err: any) {
            console.error(`>> [DO:ERROR] ${err.message || String(err)}`)
            return new Response(
                JSON.stringify({ error: err.message || 'INTERNAL_ERROR' }),
                {
                    status: 500,
                    headers: { 'Content-Type': 'application/json' },
                },
            )
        }
    }

    private async persistState(): Promise<void> {
        await this.ctx.storage.put('pending_queue', this.fairQueue.toArray())
        await this.ctx.storage.put('active_job', this.activeJob)
        await this.ctx.storage.put('active_lease', this.activeLease)
        await this.ctx.storage.put('current_epoch', this.currentEpoch)
        await this.ctx.storage.put('last_artist_id', this.lastArtistId)
        await this.ctx.storage.put(
            'dlq_records',
            Object.fromEntries(this.dlqRecords),
        )
        await this.ctx.storage.put(
            'canonical_manifests',
            Object.fromEntries(this.canonicalManifests),
        )
    }
}
