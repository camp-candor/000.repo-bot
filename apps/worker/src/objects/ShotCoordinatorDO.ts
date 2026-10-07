import { FairQueue, type ExecutionJob } from '../queue/fairQueue.js'
import {
    createGenesisBlock,
    appendLedgerEntry,
    type LedgerEntry,
} from '../ledger/cryptoLedger.js'
import {
    compactLedger,
    verifyCompactedLedger,
    COMPACTION_THRESHOLD_BLOCKS,
    DEFAULT_KEEP_TAIL_BLOCKS,
    type CompactionCheckpoint,
} from '../ledger/ledgerCompactor.js'
import {
    TelemetryBroadcaster,
    type TelemetrySubscriber,
} from '../telemetry/telemetryBroadcaster.js'
import { formatDlqAlert, ChatOpsGateway } from '../telemetry/chatOpsGateway.js'
import {
    parseSlashCommand,
    type ChatOpsCommand,
} from '../telemetry/chatOpsParser.js'
import { formatStatusResponse, formatFleetResponse } from '../telemetry/chatOpsFormatter.js'
import { ChatOpsNotifier } from '../telemetry/chatOpsNotifier.js'
import { D1StateLedger } from '../db/d1Ledger.js'
import { FleetRegistry } from '../fleet/fleetRegistry.js'
import { GitCommitClient } from '../drainage/gitCommitClient.js'
import { ColdLedgerDrainEngine } from '../drainage/coldLedgerDrain.js'
import {
    RollingR2Scrubber,
    type R2ScrubReport,
    type R2BucketInterface,
} from '../archive/r2Scrubber.js'
import { WatchdogController } from '../lifecycle/watchdogController.js'

export class ShotCoordinatorDO {
    private fairQueue = new FairQueue()
    private activeJob: ExecutionJob | null = null
    private currentEpoch = 0
    private fsmState = 'PENDING'

    // Active ledger state: compact checkpoint + active tail
    private ledgerCheckpoint: CompactionCheckpoint | null = null
    private ledgerChain: LedgerEntry[] = []

    private scrubCursor: string | null = null
    private totalCorruptedDetected = 0
    private totalHealthyVerified = 0

    private d1Ledger?: D1StateLedger
    private fleetRegistry?: FleetRegistry
    private drainEngine?: ColdLedgerDrainEngine
    private r2Scrubber?: RollingR2Scrubber
    private telemetryBroadcaster = new TelemetryBroadcaster()
    private chatOpsNotifier = new ChatOpsNotifier()
    private chatOpsGateway: ChatOpsGateway

    constructor(
        private ctx: any,
        private env: any,
    ) {
        this.chatOpsGateway = new ChatOpsGateway({
            secret: this.env?.CHATOPS_SECRET || 'default_secret',
            outboundWebhookUrl: this.env?.CHATOPS_WEBHOOK_URL,
        })

        if (this.env?.DB) {
            this.d1Ledger = new D1StateLedger(this.env.DB)
            this.fleetRegistry = new FleetRegistry(this.env.DB)

            if (
                this.env?.GITHUB_TOKEN &&
                this.env?.GITHUB_OWNER &&
                this.env?.GITHUB_REPO
            ) {
                const gitClient = new GitCommitClient({
                    token: this.env.GITHUB_TOKEN,
                })
                this.drainEngine = new ColdLedgerDrainEngine(
                    this.env.DB,
                    gitClient,
                    {
                        owner: this.env.GITHUB_OWNER,
                        repo: this.env.GITHUB_REPO,
                        branch:
                            this.env.COLD_LEDGER_BRANCH || 'audit/cold-ledger',
                    },
                )
            }
        }

        const bucket: R2BucketInterface =
            this.env?.STORAGE || this.env?.R2_BUCKET
        if (bucket) {
            this.r2Scrubber = new RollingR2Scrubber(bucket)
        }

        this.ctx.blockConcurrencyWhile?.(async () => {
            const queueData = await this.ctx.storage.get('pending_queue')
            if (Array.isArray(queueData))
                this.fairQueue = new FairQueue(queueData)

            const active = await this.ctx.storage.get('active_job')
            if (active) this.activeJob = active

            const epoch = await this.ctx.storage.get('current_epoch')
            if (typeof epoch === 'number') this.currentEpoch = epoch

            const state = await this.ctx.storage.get('fsm_state')
            if (typeof state === 'string') this.fsmState = state

            const checkpoint = await this.ctx.storage.get('ledger_checkpoint')
            if (checkpoint && typeof checkpoint === 'object') {
                this.ledgerCheckpoint = checkpoint as CompactionCheckpoint
            }

            const chain = await this.ctx.storage.get('ledger_chain')
            if (Array.isArray(chain)) this.ledgerChain = chain

            const subscribers = await this.ctx.storage.get(
                'telemetry_subscribers',
            )
            if (Array.isArray(subscribers)) {
                for (const sub of subscribers)
                    this.telemetryBroadcaster.registerSubscriber(sub)
            }

            const cursor = await this.ctx.storage.get('r2_scrub_cursor')
            if (typeof cursor === 'string') this.scrubCursor = cursor

            const corrupted = await this.ctx.storage.get(
                'total_corrupted_detected',
            )
            if (typeof corrupted === 'number')
                this.totalCorruptedDetected = corrupted

            const healthy = await this.ctx.storage.get('total_healthy_verified')
            if (typeof healthy === 'number') this.totalHealthyVerified = healthy

            console.log(
                `>> [DO:BOOT] ShotCoordinatorDO loaded. State: ${this.fsmState}, Checkpoint: ${this.ledgerCheckpoint?.checkpointIndex ?? 'NONE'}, Tail: ${this.ledgerChain.length} blocks [OK]`,
            )
        })
    }

    /**
     * Internal auto-compaction guard to prevent isolate RAM exhaustion.
     */
    private async autoCompactIfNeeded(): Promise<void> {
        if (this.ledgerChain.length >= COMPACTION_THRESHOLD_BLOCKS) {
            console.log(
                `>> [DO:COMPACT] Chain length (${this.ledgerChain.length}) reached threshold. Executing auto-compaction [COMPACT]`,
            )
            const compactedState = await compactLedger(
                this.ledgerChain,
                this.ledgerCheckpoint || undefined,
                DEFAULT_KEEP_TAIL_BLOCKS,
            )

            this.ledgerCheckpoint = compactedState.checkpoint
            this.ledgerChain = compactedState.activeTail

            await this.ctx.storage.put(
                'ledger_checkpoint',
                this.ledgerCheckpoint,
            )
            await this.ctx.storage.put('ledger_chain', this.ledgerChain)

            // Broadcast compaction event asynchronously
            this.ctx.waitUntil?.(
                this.telemetryBroadcaster.broadcast('COMPACTION', {
                    checkpoint: this.ledgerCheckpoint,
                }),
            )
        }
    }

    private mirrorToD1(fn: (ledger: D1StateLedger) => Promise<void>): void {
        if (!this.d1Ledger) return
        const p = fn(this.d1Ledger).catch((err) => {
            console.error(
                `>> [D1:SYNC_ERR] Failed asynchronous D1 mirror: ${err.message} [FAIL]`,
            )
        })

        if (this.ctx.waitUntil) {
            this.ctx.waitUntil(p)
        }
    }

    async alarm(): Promise<void> {
        const evaluation = WatchdogController.evaluateAlarm(
            this.activeJob,
            this.fsmState,
        )

        if (evaluation === 'IGNORE_EMPTY' || evaluation === 'IGNORE_ABORTED') {
            await this.ctx.storage.deleteAlarm()
            return
        }

        const task = this.activeJob!
        const previousEpoch = this.currentEpoch
        task.attemptCount += 1
        this.currentEpoch += 1

        if (evaluation === 'RETRY_REQUIRED') {
            this.fsmState = 'RETRYING'
            this.fairQueue.requeue(task)
            this.activeJob = null
            this.ledgerChain = await appendLedgerEntry(
                this.ledgerChain,
                'WATCHDOG_TIMEOUT_REQUEUE',
                {
                    taskId: task.taskId,
                    attempt: task.attemptCount,
                    newEpoch: this.currentEpoch,
                },
            )

            this.mirrorToD1(async (ledger) => {
                await ledger.recordStateTransition({
                    taskId: task.taskId,
                    fromState: 'RUNNING',
                    toState: 'RETRYING',
                    epoch: previousEpoch,
                    timestampMs: Date.now(),
                    metadata: { attempt: task.attemptCount },
                })
            })
        } else if (evaluation === 'DLQ_REQUIRED') {
            this.fsmState = 'DLQ'
            this.activeJob = null
            this.ledgerChain = await appendLedgerEntry(
                this.ledgerChain,
                'CIRCUIT_BREAKER_DLQ',
                {
                    taskId: task.taskId,
                    attemptCount: task.attemptCount,
                },
            )

            this.mirrorToD1(async (ledger) => {
                await ledger.recordStateTransition({
                    taskId: task.taskId,
                    fromState: 'RUNNING',
                    toState: 'DLQ',
                    epoch: previousEpoch,
                    timestampMs: Date.now(),
                    metadata: { reason: 'MAX_ATTEMPTS_EXHAUSTED' },
                })
            })

            if (this.env?.CHATOPS_WEBHOOK_URL) {
                const dlqAlert = formatDlqAlert(
                    task.taskId,
                    task.attemptCount,
                    'MAX_ATTEMPTS_EXHAUSTED',
                )
                this.chatOpsGateway
                    .dispatchAlert(this.env.CHATOPS_WEBHOOK_URL, dlqAlert)
                    .catch(() => {})
            }
        }

        await this.autoCompactIfNeeded()
        await this.ctx.storage.deleteAlarm()
        await this.persistState()
    }

    async fetch(request: Request): Promise<Response> {
        const url = new URL(request.url)

        try {
            // Artifact Completion Route (Zombie Guard)
            if (
                request.method === 'POST' &&
                url.pathname.endsWith('/tasks/complete')
            ) {
                const body = (await request.json().catch(() => ({}))) as any
                const { epoch, sha256 } = body

                if (!this.activeJob) {
                    return new Response(
                        JSON.stringify({ error: 'NO_ACTIVE_TASK' }),
                        { status: 404 },
                    )
                }

                // RULE: Monotonic Epoch Fencing Law
                // Prevents old renders completed by zombie hardware from committing
                if (epoch !== this.currentEpoch) {
                    console.warn(
                        `>> [EPOCH_FENCE:BLOCK] Rejected zombie submission. Expected Epoch ${this.currentEpoch}, got ${epoch} [ZOMBIE]`,
                    )
                    return new Response(
                        JSON.stringify({
                            error: 'STALE_EPOCH_ZOMBIE',
                            message: `Presented epoch ${epoch} is stale. Active fence is ${this.currentEpoch}`,
                        }),
                        {
                            status: 409,
                            headers: { 'Content-Type': 'application/json' },
                        },
                    )
                }

                this.fsmState = 'VERIFYING'
                await this.ctx.storage.deleteAlarm()

                const canonicalKey = `canonical/renders/${this.activeJob.taskId}/${sha256}.mp4`
                this.ledgerChain = await appendLedgerEntry(
                    this.ledgerChain,
                    'ARTIFACT_PROMOTED',
                    {
                        canonicalKey,
                        sha256,
                        epoch: this.currentEpoch,
                    },
                )

                this.activeJob = null
                await this.persistState()

                return new Response(
                    JSON.stringify({ ok: true, promoted: true, canonicalKey }),
                    { status: 200 },
                )
            }

            // Task Enqueue Route
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
                    maxAttempts = 3,
                } = body

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
                }

                const enqueued = this.fairQueue.enqueue(job)
                if (!enqueued) {
                    return new Response(
                        JSON.stringify({ error: 'DUPLICATE_TASK' }),
                        {
                            status: 409,
                        },
                    )
                }

                this.fsmState = 'PENDING'
                if (this.ledgerChain.length === 0 && !this.ledgerCheckpoint) {
                    this.ledgerChain = [
                        await createGenesisBlock(taskId, {
                            enqueuedAt: Date.now(),
                        }),
                    ]
                } else {
                    this.ledgerChain = await appendLedgerEntry(
                        this.ledgerChain,
                        'TASK_ENQUEUED',
                        { taskId, artistId },
                    )
                }

                await this.autoCompactIfNeeded()
                await this.persistState()
                return new Response(
                    JSON.stringify({
                        ok: true,
                        taskId,
                        position: this.fairQueue.size(),
                    }),
                    { status: 200 },
                )
            }

            if (
                request.method === 'POST' &&
                url.pathname.endsWith('/leases/claim')
            ) {
                if (this.activeJob !== null) {
                    return new Response(
                        JSON.stringify({ ok: false, busy: true }),
                        {
                            status: 200,
                        },
                    )
                }

                const job = this.fairQueue.dequeueNextFair(null)
                if (!job) return new Response(null, { status: 204 })

                this.currentEpoch += 1
                this.activeJob = job
                this.fsmState = 'RUNNING'

                this.ledgerChain = await appendLedgerEntry(
                    this.ledgerChain,
                    'LEASE_CLAIMED',
                    {
                        taskId: job.taskId,
                        epoch: this.currentEpoch,
                    },
                )

                // Arm the watchdog lease ceiling
                await WatchdogController.armWatchdog(
                    this.ctx,
                    job.taskId,
                    30_000,
                )
                await this.persistState()

                return new Response(
                    JSON.stringify({
                        ok: true,
                        taskId: job.taskId,
                        epoch: this.currentEpoch,
                        prompts: job.prompts,
                        seeds: job.seeds,
                    }),
                    { status: 200 },
                )
            }

            // On-Demand Ledger Compaction Route
            if (
                request.method === 'POST' &&
                url.pathname.endsWith('/ledger/compact')
            ) {
                const body = (await request.json().catch(() => ({}))) as any
                const keepTail = body.keepTail || DEFAULT_KEEP_TAIL_BLOCKS

                if (this.ledgerChain.length <= keepTail) {
                    return new Response(
                        JSON.stringify({
                            ok: false,
                            error: 'INSUFFICIENT_BLOCKS',
                            message: `Chain length ${this.ledgerChain.length} does not exceed keepTail ${keepTail}`,
                        }),
                        { status: 400 },
                    )
                }

                const compactedState = await compactLedger(
                    this.ledgerChain,
                    this.ledgerCheckpoint || undefined,
                    keepTail,
                )

                this.ledgerCheckpoint = compactedState.checkpoint
                this.ledgerChain = compactedState.activeTail

                await this.ctx.storage.put(
                    'ledger_checkpoint',
                    this.ledgerCheckpoint,
                )
                await this.ctx.storage.put('ledger_chain', this.ledgerChain)

                // Broadcast compaction receipt
                this.ctx.waitUntil?.(
                    this.telemetryBroadcaster.broadcast('COMPACTION', {
                        checkpoint: this.ledgerCheckpoint,
                    }),
                )

                return new Response(
                    JSON.stringify({
                        ok: true,
                        checkpoint: this.ledgerCheckpoint,
                        activeTailLength: this.ledgerChain.length,
                    }),
                    {
                        status: 200,
                        headers: { 'Content-Type': 'application/json' },
                    },
                )
            }

            // Compacted Ledger Verification Route
            if (
                request.method === 'GET' &&
                url.pathname.endsWith('/ledger/compact/verify')
            ) {
                if (!this.ledgerCheckpoint) {
                    return new Response(
                        JSON.stringify({
                            ok: true,
                            compacted: false,
                            message: 'NO_CHECKPOINT_PRESENT',
                        }),
                        { status: 200 },
                    )
                }

                const result = await verifyCompactedLedger({
                    checkpoint: this.ledgerCheckpoint,
                    activeTail: this.ledgerChain,
                })

                return new Response(
                    JSON.stringify({ ok: result.valid, ...result }),
                    {
                        status: result.valid ? 200 : 500,
                        headers: { 'Content-Type': 'application/json' },
                    },
                )
            }

            // Telemetry Subscriber Registration
            if (
                request.method === 'POST' &&
                url.pathname.endsWith('/telemetry/subscribe')
            ) {
                const body = (await request
                    .json()
                    .catch(() => ({}))) as TelemetrySubscriber
                if (!body.id || !body.url || !Array.isArray(body.channels)) {
                    return new Response(
                        JSON.stringify({ error: 'INVALID_SUBSCRIBER_SCHEMA' }),
                        { status: 400 },
                    )
                }

                this.telemetryBroadcaster.registerSubscriber(body)
                await this.ctx.storage.put(
                    'telemetry_subscribers',
                    this.telemetryBroadcaster.getSubscribers(),
                )

                return new Response(
                    JSON.stringify({ ok: true, subscriberId: body.id }),
                    { status: 200 },
                )
            }

            // Telemetry Broadcast Ingress
            if (
                request.method === 'POST' &&
                url.pathname.endsWith('/telemetry/broadcast')
            ) {
                const body = (await request.json().catch(() => ({}))) as any
                const { channel, payload } = body

                if (!channel || !payload) {
                    return new Response(
                        JSON.stringify({ error: 'MISSING_CHANNEL_OR_PAYLOAD' }),
                        { status: 400 },
                    )
                }

                const receipt = await this.telemetryBroadcaster.broadcast(
                    channel,
                    payload,
                )
                return new Response(JSON.stringify({ ok: true, receipt }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                })
            }

            // Cold Ledger Drainage Route
            if (
                request.method === 'POST' &&
                url.pathname.endsWith('/ledger/drain')
            ) {
                if (!this.drainEngine) {
                    return new Response(
                        JSON.stringify({ error: 'DRAIN_ENGINE_UNCONFIGURED' }),
                        { status: 503 },
                    )
                }

                const body = (await request.json().catch(() => ({}))) as any
                const now = body.nowMs || Date.now()
                const receipt = await this.drainEngine.drainToGit(now)

                if (!receipt) {
                    return new Response(
                        JSON.stringify({
                            ok: true,
                            message: 'ZERO_TASKS_ELIGIBLE',
                            receipt: null,
                        }),
                        { status: 200 },
                    )
                }

                // Append Cold Drainage Block to Hash Chain
                this.ledgerChain = await appendLedgerEntry(
                    this.ledgerChain,
                    'COLD_LEDGER_DRAINED',
                    {
                        batchId: receipt.batchId,
                        taskCount: receipt.taskCount,
                        commitSha: receipt.commitSha,
                        prunedTransitionsCount: receipt.prunedTransitionsCount,
                    },
                )

                await this.persistState()

                return new Response(JSON.stringify({ ok: true, receipt }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                })
            }

            // Ledger Drainage Status Route
            if (
                request.method === 'GET' &&
                url.pathname.endsWith('/ledger/drain/status')
            ) {
                if (!this.env?.DB) {
                    return new Response(
                        JSON.stringify({ error: 'DB_UNAVAILABLE' }),
                        {
                            status: 503,
                        },
                    )
                }

                const stats = await this.env.DB.prepare(
                    `
                    SELECT 
                        SUM(CASE WHEN status IN ('VERIFYING', 'PROMOTED', 'DLQ', 'ABORTED') THEN 1 ELSE 0 END) as finalized_pending_drain,
                        SUM(CASE WHEN status = 'COLD_ARCHIVED' THEN 1 ELSE 0 END) as cold_archived,
                        COUNT(*) as total_tasks
                    FROM task_ledger;
                `,
                ).first()

                return new Response(JSON.stringify({ ok: true, stats }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                })
            }

            // Rolling R2 Archive Scrub Route
            if (
                request.method === 'POST' &&
                url.pathname.endsWith('/archive/scrub')
            ) {
                if (!this.r2Scrubber) {
                    return new Response(
                        JSON.stringify({ error: 'R2_SCRUBBER_UNCONFIGURED' }),
                        { status: 503 },
                    )
                }

                const body = (await request.json().catch(() => ({}))) as any
                const prefix = body.prefix
                const batchLimit = body.batchLimit || 50

                const report: R2ScrubReport = await this.r2Scrubber.scrubBatch({
                    prefix,
                    cursor: this.scrubCursor || undefined,
                    batchLimit,
                })

                this.scrubCursor = report.nextCursor || null
                this.totalHealthyVerified += report.healthyCount
                this.totalCorruptedDetected += report.corruptedCount

                if (report.corruptedCount > 0) {
                    this.ledgerChain = await appendLedgerEntry(
                        this.ledgerChain,
                        'BIT_ROT_QUARANTINED',
                        {
                            batchId: report.batchId,
                            corruptedCount: report.corruptedCount,
                            quarantinedKeys: report.quarantinedKeys,
                        },
                    )

                    if (this.env?.CHATOPS_WEBHOOK_URL) {
                        const alertMsg = [
                            '```text',
                            '================================================================================',
                            '>> [ALERT:BIT_ROT] ARCHIVE STORAGE CORRUPTION DETECTED',
                            '================================================================================',
                            `BATCH ID:       ${report.batchId}`,
                            `CORRUPTED:      ${report.corruptedCount} object(s)`,
                            `QUARANTINED:    ${report.quarantinedKeys.join(', ')}`,
                            'ACTION:         CORRUPTED RENDER REMOVED FROM CANONICAL NAMESPACE [FAIL]',
                            '================================================================================',
                            '```',
                        ].join('\n')

                        this.ctx.waitUntil?.(
                            this.chatOpsGateway.dispatchAlert(
                                this.env.CHATOPS_WEBHOOK_URL,
                                alertMsg,
                            ),
                        )
                    }
                } else {
                    this.ledgerChain = await appendLedgerEntry(
                        this.ledgerChain,
                        'R2_ARCHIVE_SCRUBBED',
                        {
                            batchId: report.batchId,
                            scannedCount: report.totalScanned,
                            healthyCount: report.healthyCount,
                        },
                    )
                }

                await this.persistState()

                return new Response(JSON.stringify({ ok: true, report }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                })
            }

            // Scrub Status Inspection Route
            if (
                request.method === 'GET' &&
                url.pathname.endsWith('/archive/scrub/status')
            ) {
                return new Response(
                    JSON.stringify({
                        ok: true,
                        activeCursor: this.scrubCursor,
                        totalHealthyVerified: this.totalHealthyVerified,
                        totalCorruptedDetected: this.totalCorruptedDetected,
                    }),
                    {
                        status: 200,
                        headers: { 'Content-Type': 'application/json' },
                    },
                )
            }

            // Inbound Interactive ChatOps Command Ingress
            if (
                request.method === 'POST' &&
                url.pathname.endsWith('/chatops/command')
            ) {
                const authResult =
                    await this.chatOpsGateway.interceptAndAuthenticate(request)
                if (!authResult.authenticated) {
                    return authResult.response!
                }
                const rawBody = authResult.rawBody!

                let cmd: ChatOpsCommand
                try {
                    const parsed = JSON.parse(rawBody)
                    cmd = parsed.text
                        ? parseSlashCommand(parsed.text, parsed.operatorId)
                        : parsed
                } catch {
                    cmd = parseSlashCommand(rawBody, 'operator_webhook')
                }

                return await this.handleChatOpsCommand(cmd)
            }

            return new Response('NOT_FOUND', { status: 404 })
        } catch (err: any) {
            console.error(`>> [DO:ERR] ${err.message}`)
            return new Response(JSON.stringify({ error: err.message }), {
                status: 500,
            })
        }
    }

    /**
     * Handles authenticated operator ChatOps commands.
     */
    private async handleChatOpsCommand(cmd: ChatOpsCommand): Promise<Response> {
        const headHash =
            this.ledgerChain[this.ledgerChain.length - 1]?.blockHash ||
            '0'.repeat(64)

        switch (cmd.action) {
            case 'STATUS': {
                const taskId = cmd.taskId || this.activeJob?.taskId || 'NONE'
                const formatted = formatStatusResponse(
                    taskId,
                    this.fsmState,
                    this.currentEpoch,
                    this.activeJob?.attemptCount || 0,
                    this.activeJob?.maxAttempts || 3,
                    headHash,
                    this.activeJob ? 'rig2_gpu' : null,
                )
                return new Response(
                    JSON.stringify({
                        ok: true,
                        formatted,
                        state: this.fsmState,
                        epoch: this.currentEpoch,
                    }),
                    {
                        status: 200,
                        headers: { 'Content-Type': 'application/json' },
                    },
                )
            }

            case 'FLEET': {
                let workers: any[] = []
                if (this.fleetRegistry) {
                    workers = await this.fleetRegistry.getEligibleWorkers(0)
                }
                const formatted = formatFleetResponse(workers)
                return new Response(
                    JSON.stringify({ ok: true, formatted, workers }),
                    {
                        status: 200,
                        headers: { 'Content-Type': 'application/json' },
                    },
                )
            }

            case 'OVERRIDE': {
                if (!cmd.taskId || !cmd.operatorId) {
                    return new Response(
                        JSON.stringify({
                            error: 'MISSING_TASK_ID_OR_OPERATOR',
                        }),
                        {
                            status: 400,
                        },
                    )
                }

                // Disarm watchdog alarm if active
                await this.ctx.storage.deleteAlarm()

                this.currentEpoch += 1
                const previousState = this.fsmState
                this.fsmState = 'PENDING'

                const targetJob: ExecutionJob = this.activeJob || {
                    taskId: cmd.taskId,
                    artistId: 'operator_override',
                    idempotencyKey: `idemp-override-${Date.now()}`,
                    workflowTemplate: 'default.json',
                    prompts: {},
                    seeds: [cmd.seed ?? 42],
                    enqueuedAt: Date.now(),
                    attemptCount: 0,
                    maxAttempts: 3,
                }

                targetJob.attemptCount = 0
                if (!targetJob.prompts) targetJob.prompts = {}
                if (!targetJob.seeds) targetJob.seeds = [cmd.seed ?? 42]
                if (cmd.positivePrompt)
                    targetJob.prompts.positive = cmd.positivePrompt
                if (cmd.negativePrompt)
                    targetJob.prompts.negative = cmd.negativePrompt
                if (cmd.seed !== undefined) targetJob.seeds = [cmd.seed]
                if (cmd.denoiseStrength !== undefined)
                    targetJob.prompts.denoiseStrength = cmd.denoiseStrength

                this.fairQueue.requeuePriority(targetJob)
                this.activeJob = null

                const diff = `Prompt updated to: "${targetJob.prompts.positive || 'SAME'}", Seed: ${targetJob.seeds?.[0] ?? 'SAME'}`
                if (this.ledgerChain.length === 0) {
                    this.ledgerChain = [await createGenesisBlock(cmd.taskId)]
                }
                this.ledgerChain = await appendLedgerEntry(
                    this.ledgerChain,
                    'CHATOPS_MANUAL_OVERRIDE',
                    {
                        taskId: cmd.taskId,
                        operatorId: cmd.operatorId,
                        newEpoch: this.currentEpoch,
                        diff,
                        previousState,
                        reason: cmd.reason || 'Manual override',
                    },
                )

                console.log(
                    `>> [MUTATION:OVERRIDE] Task '${cmd.taskId}' bumped to Epoch ${this.currentEpoch}, extracted to PENDING [OK]`,
                )

                await this.persistState()

                if (this.env?.CHATOPS_WEBHOOK_URL) {
                    const formatted =
                        this.chatOpsNotifier.formatInterventionReceipt(
                            'OVERRIDE',
                            cmd.taskId,
                            cmd.operatorId,
                            {
                                EPOCH_ADVANCED: this.currentEpoch,
                                REASON: cmd.reason || 'N/A',
                                NEW_STATE: this.fsmState,
                            },
                        )

                    this.ctx.waitUntil?.(
                        this.chatOpsNotifier.dispatchAsyncAlert(
                            this.env.CHATOPS_WEBHOOK_URL,
                            formatted,
                        ),
                    )
                }

                console.log(
                    `>> [NON_REPUDIATION:LOG] Action 'OVERRIDE' by '${cmd.operatorId}' committed to ledger [OK]`,
                )

                return new Response(
                    JSON.stringify({
                        ok: true,
                        action: 'OVERRIDE',
                        epoch: this.currentEpoch,
                    }),
                    {
                        status: 200,
                        headers: { 'Content-Type': 'application/json' },
                    },
                )
            }

            case 'RETRY': {
                if (!cmd.taskId || !cmd.operatorId) {
                    return new Response(
                        JSON.stringify({
                            error: 'MISSING_TASK_ID_OR_OPERATOR',
                        }),
                        {
                            status: 400,
                        },
                    )
                }

                await this.ctx.storage.deleteAlarm()
                this.currentEpoch += 1
                const previousState = this.fsmState
                this.fsmState = 'PENDING'

                const jobToRetry = this.activeJob || {
                    taskId: cmd.taskId,
                    artistId: 'operator_retry',
                    idempotencyKey: `idemp-retry-${Date.now()}`,
                    workflowTemplate: 'default.json',
                    prompts: {},
                    seeds: [42],
                    enqueuedAt: Date.now(),
                    attemptCount: 0,
                    maxAttempts: 3,
                }

                jobToRetry.attemptCount = 0
                this.fairQueue.requeuePriority(jobToRetry)
                this.activeJob = null

                if (this.ledgerChain.length === 0) {
                    this.ledgerChain = [await createGenesisBlock(cmd.taskId)]
                }
                this.ledgerChain = await appendLedgerEntry(
                    this.ledgerChain,
                    'CHATOPS_FORCE_RETRY',
                    {
                        taskId: cmd.taskId,
                        operatorId: cmd.operatorId,
                        newEpoch: this.currentEpoch,
                        previousState,
                        reason: cmd.reason || 'Manual force retry',
                    },
                )

                await this.persistState()

                if (this.env?.CHATOPS_WEBHOOK_URL) {
                    const formatted =
                        this.chatOpsNotifier.formatInterventionReceipt(
                            'RETRY',
                            cmd.taskId,
                            cmd.operatorId,
                            {
                                EPOCH_ADVANCED: this.currentEpoch,
                                REASON: cmd.reason || 'N/A',
                                NEW_STATE: this.fsmState,
                            },
                        )

                    this.ctx.waitUntil?.(
                        this.chatOpsNotifier.dispatchAsyncAlert(
                            this.env.CHATOPS_WEBHOOK_URL,
                            formatted,
                        ),
                    )
                }

                console.log(
                    `>> [NON_REPUDIATION:LOG] Action 'RETRY' by '${cmd.operatorId}' committed to ledger [OK]`,
                )

                return new Response(
                    JSON.stringify({
                        ok: true,
                        action: 'RETRY',
                        epoch: this.currentEpoch,
                    }),
                    {
                        status: 200,
                        headers: { 'Content-Type': 'application/json' },
                    },
                )
            }

            case 'ABORT': {
                if (!cmd.taskId || !cmd.operatorId) {
                    return new Response(
                        JSON.stringify({
                            error: 'MISSING_TASK_ID_OR_OPERATOR',
                        }),
                        {
                            status: 400,
                        },
                    )
                }

                // 1. Hardware alarm disarm
                await WatchdogController.disarmWatchdog(this.ctx, cmd.taskId)

                this.currentEpoch += 1
                const previousState = this.fsmState

                // 2. Terminal State Transition
                this.fsmState = 'ABORTED'

                // 3. Clear from queue if pending, or nullify active job
                this.fairQueue.remove(cmd.taskId)
                this.activeJob = null

                // 4. Asynchronous Ledger Commitment
                if (this.ledgerChain.length === 0) {
                    this.ledgerChain = [await createGenesisBlock(cmd.taskId)]
                }
                this.ledgerChain = await appendLedgerEntry(
                    this.ledgerChain,
                    'CHATOPS_TASK_ABORTED',
                    {
                        taskId: cmd.taskId,
                        operatorId: cmd.operatorId,
                        previousState,
                        newEpoch: this.currentEpoch,
                        reason: cmd.reason || 'Task aborted',
                    },
                )

                console.log(
                    `>> [TERMINAL:ABORT] Task '${cmd.taskId}' permanently aborted by '${cmd.operatorId}'. Watchdog neutralized [HALT]`,
                )

                await this.persistState()

                if (this.env?.CHATOPS_WEBHOOK_URL) {
                    const formatted =
                        this.chatOpsNotifier.formatInterventionReceipt(
                            'ABORT',
                            cmd.taskId,
                            cmd.operatorId,
                            {
                                EPOCH_ADVANCED: this.currentEpoch,
                                REASON: cmd.reason || 'N/A',
                                NEW_STATE: this.fsmState,
                            },
                        )

                    this.ctx.waitUntil?.(
                        this.chatOpsNotifier.dispatchAsyncAlert(
                            this.env.CHATOPS_WEBHOOK_URL,
                            formatted,
                        ),
                    )
                }

                console.log(
                    `>> [NON_REPUDIATION:LOG] Action 'ABORT' by '${cmd.operatorId}' committed to ledger [OK]`,
                )

                return new Response(
                    JSON.stringify({
                        ok: true,
                        action: 'ABORT',
                        epoch: this.currentEpoch,
                    }),
                    {
                        status: 200,
                        headers: { 'Content-Type': 'application/json' },
                    },
                )
            }

            default:
                return new Response(
                    JSON.stringify({ error: 'UNRECOGNIZED_ACTION' }),
                    {
                        status: 400,
                    },
                )
        }
    }

    private async persistState(): Promise<void> {
        await this.autoCompactIfNeeded()
        await this.ctx.storage.put('pending_queue', this.fairQueue.toArray())
        await this.ctx.storage.put('active_job', this.activeJob)
        await this.ctx.storage.put('current_epoch', this.currentEpoch)
        await this.ctx.storage.put('fsm_state', this.fsmState)
        await this.ctx.storage.put('ledger_checkpoint', this.ledgerCheckpoint)
        await this.ctx.storage.put('ledger_chain', this.ledgerChain)
        await this.ctx.storage.put('r2_scrub_cursor', this.scrubCursor)
        await this.ctx.storage.put(
            'total_corrupted_detected',
            this.totalCorruptedDetected,
        )
        await this.ctx.storage.put(
            'total_healthy_verified',
            this.totalHealthyVerified,
        )
    }
}
