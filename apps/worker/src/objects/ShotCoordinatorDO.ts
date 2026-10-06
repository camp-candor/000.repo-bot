import {
    evaluateTransition,
    TaskState,
    FSMEvent,
    AuthenticatedActor,
    FSMContext,
    TransitionResult,
} from '../fsm/transitions.js'
import { TimerScheduler } from './timerScheduler.js'

export interface ShotCoordinatorStateRecord {
    currentState: TaskState
    ctx: FSMContext
    outbox: Array<{
        eventId: string
        fromState: TaskState
        toState: TaskState
        event: FSMEvent
        timestampMs: number
    }>
}

export class ShotCoordinatorDO {
    private currentState: TaskState = 'PENDING'
    private ctx: FSMContext
    private timerScheduler: TimerScheduler
    private outbox: Array<{
        eventId: string
        fromState: TaskState
        toState: TaskState
        event: FSMEvent
        timestampMs: number
    }> = []

    private isHydrated = false

    constructor(private readonly state: DurableObjectState) {
        this.timerScheduler = new TimerScheduler(this.state.storage)
        this.ctx = {
            taskId: 'UNINITIALIZED',
            currentEpoch: 1,
            attemptCount: 1,
            maxAttempts: 3,
            isHighRiskPath: false,
            scopeCheckPassed: false,
            qualityCheckPassed: false,
            branchName: 'spec/uninitialized',
            targetRepo: 'camp-candor/000.repo-bot',
            baseCommitSha: '0000000000000000000000000000000000000000',
        }
    }

    /**
     * Ensures in-memory properties are hydrated from Durable Object NVMe storage.
     */
    private async ensureHydrated(): Promise<void> {
        if (this.isHydrated) return

        const stored =
            await this.state.storage.get<ShotCoordinatorStateRecord>(
                'fsm_record',
            )
        if (stored) {
            this.currentState = stored.currentState
            this.ctx = stored.ctx
            this.outbox = stored.outbox || []
        }
        this.isHydrated = true
    }

    /**
     * Atomically commits FSM state and context to persistent storage.
     */
    private async persist(): Promise<void> {
        const record: ShotCoordinatorStateRecord = {
            currentState: this.currentState,
            ctx: this.ctx,
            outbox: this.outbox,
        }
        await this.state.storage.put('fsm_record', record)
    }

    /**
     * Universal Choke Point: Disarms the active watchdog alarm on exit from RUNNING.
     */
    private async leaveRunning(_reason: string): Promise<void> {
        await this.timerScheduler.disarmWatchdog()
    }

    /**
     * Arms the 30-second watchdog timer when entering the RUNNING state.
     */
    private async enterRunning(): Promise<void> {
        await this.timerScheduler.armWatchdog(30_000, this.ctx.currentEpoch)
    }

    /**
     * Applies a transition deterministically, managing universal watchdog lifecycle.
     */
    async applyTransition(
        event: FSMEvent,
        actor: AuthenticatedActor,
        payload?: any,
    ): Promise<TransitionResult> {
        await this.ensureHydrated()
        const previousState = this.currentState

        // 1. Evaluate pure FSM transition matrix
        const result = evaluateTransition(
            this.currentState,
            event,
            actor,
            this.ctx,
            payload,
        )

        if (result.isNoop) {
            return result
        }

        // 2. Choke Point: Universal alarm disarming if exiting RUNNING
        if (previousState === 'RUNNING' && result.nextState !== 'RUNNING') {
            await this.leaveRunning(`TRANSITION_${event}`)
        }

        // 3. Update state and context patch
        this.currentState = result.nextState
        if (result.contextPatch) {
            this.ctx = { ...this.ctx, ...result.contextPatch }
        }

        // 4. Choke Point: Arm watchdog if entering RUNNING
        if (this.currentState === 'RUNNING' && previousState !== 'RUNNING') {
            await this.enterRunning()
        }

        // 5. Append to transactional outbox for D1 projection
        const eventRecord = {
            eventId: `evt-${this.ctx.taskId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            fromState: previousState,
            toState: this.currentState,
            event,
            timestampMs: Date.now(),
        }
        this.outbox.push(eventRecord)

        await this.persist()
        return result
    }

    /**
     * Proactive Storage Alarm Hook: Triggered when watchdog timer expires.
     */
    async alarm(): Promise<void> {
        await this.ensureHydrated()

        // Verify alarm validity against current epoch and state
        const isAlarmValid = await this.timerScheduler.isAlarmValidForEpoch(
            this.ctx.currentEpoch,
        )

        if (this.currentState === 'RUNNING' && isAlarmValid) {
            await this.applyTransition(
                'WATCHDOG_EXPIRE',
                { type: 'SYSTEM_INTERNAL' },
                { reason: 'WATCHDOG_TIMEOUT_EXPIRED' },
            )
        } else {
            // Clear stray or obsolete alarms
            await this.timerScheduler.disarmWatchdog()
        }
    }

    /**
     * Primary HTTP Router for Worker Ingress.
     */
    async fetch(request: Request): Promise<Response> {
        await this.ensureHydrated()
        const url = new URL(request.url)
        const path = url.pathname

        try {
            // 1. GET /fsm/context
            if (request.method === 'GET' && path === '/fsm/context') {
                const activeTimer = await this.timerScheduler.getActiveTimer()
                return new Response(
                    JSON.stringify({
                        currentState: this.currentState,
                        context: this.ctx,
                        activeTimer,
                        outboxPendingCount: this.outbox.length,
                    }),
                    {
                        headers: { 'Content-Type': 'application/json' },
                        status: 200,
                    },
                )
            }

            // 2. POST /fsm/initialize
            if (request.method === 'POST' && path === '/fsm/initialize') {
                const body: any = await request.json()
                if (
                    !body?.force &&
                    this.ctx.taskId !== 'UNINITIALIZED' &&
                    this.currentState !== 'PENDING'
                ) {
                    return new Response(
                        JSON.stringify({
                            error: `CANNOT_INITIALIZE_ACTIVE_TASK: Task '${this.ctx.taskId}' is currently in state '${this.currentState}'. Cannot re-initialize active task without authorization.`,
                        }),
                        {
                            headers: { 'Content-Type': 'application/json' },
                            status: 409,
                        },
                    )
                }
                this.ctx = {
                    ...this.ctx,
                    ...body,
                    currentEpoch: 1,
                    attemptCount: 1,
                }
                this.currentState = 'PENDING'
                await this.persist()
                return new Response(
                    JSON.stringify({
                        ok: true,
                        state: this.currentState,
                        context: this.ctx,
                    }),
                    {
                        headers: { 'Content-Type': 'application/json' },
                        status: 200,
                    },
                )
            }

            // 3. POST /fsm/claim
            if (request.method === 'POST' && path === '/fsm/claim') {
                if (
                    this.currentState !== 'PENDING' &&
                    this.currentState !== 'RETRYING'
                ) {
                    return new Response(
                        JSON.stringify({
                            error: `CANNOT_CLAIM_TASK: Current state is '${this.currentState}', expected PENDING or RETRYING.`,
                        }),
                        {
                            headers: { 'Content-Type': 'application/json' },
                            status: 409,
                        },
                    )
                }

                await this.applyTransition('LEASE_CLAIMED', {
                    type: 'SYSTEM_INTERNAL',
                })
                return new Response(
                    JSON.stringify({
                        ok: true,
                        state: this.currentState,
                        epoch: this.ctx.currentEpoch,
                        branchName: this.ctx.branchName,
                    }),
                    {
                        headers: { 'Content-Type': 'application/json' },
                        status: 200,
                    },
                )
            }

            // 4. POST /fsm/heartbeat
            if (request.method === 'POST' && path === '/fsm/heartbeat') {
                const body: any = await request.json()
                const incomingEpoch = Number(body?.epoch)

                if (incomingEpoch !== this.ctx.currentEpoch) {
                    return new Response(
                        JSON.stringify({
                            error: `STALE_WORKER_EPOCH: Incoming epoch (${incomingEpoch}) does not match active epoch (${this.ctx.currentEpoch}).`,
                        }),
                        {
                            headers: { 'Content-Type': 'application/json' },
                            status: 409,
                        },
                    )
                }

                if (this.currentState === 'RUNNING') {
                    // Re-arm the 30-second rolling watchdog
                    await this.timerScheduler.armWatchdog(
                        30_000,
                        this.ctx.currentEpoch,
                    )
                }

                return new Response(
                    JSON.stringify({
                        ok: true,
                        state: this.currentState,
                        epoch: this.ctx.currentEpoch,
                    }),
                    {
                        headers: { 'Content-Type': 'application/json' },
                        status: 200,
                    },
                )
            }

            // 5. POST /fsm/transition
            if (request.method === 'POST' && path === '/fsm/transition') {
                const body: any = await request.json()
                const { event, actor, payload } = body

                if (!event || !actor) {
                    return new Response(
                        JSON.stringify({ error: 'MISSING_EVENT_OR_ACTOR' }),
                        {
                            headers: { 'Content-Type': 'application/json' },
                            status: 400,
                        },
                    )
                }

                const res = await this.applyTransition(event, actor, payload)
                return new Response(
                    JSON.stringify({
                        ok: true,
                        state: this.currentState,
                        transition: res,
                    }),
                    {
                        headers: { 'Content-Type': 'application/json' },
                        status: 200,
                    },
                )
            }

            // 6. POST /tasks/complete (Promotion Boundary Fencing Gate)
            if (request.method === 'POST' && path === '/tasks/complete') {
                const body: any = await request.json()
                const incomingEpoch = Number(body?.epoch)
                const headSha = body?.headSha

                // Fencing Gate Assertion: Reject obsolete or partitioned zombie workers
                if (incomingEpoch !== this.ctx.currentEpoch) {
                    return new Response(
                        JSON.stringify({
                            error: `PROMOTION_FENCE_REJECTED: Cannot promote artifacts from superseded epoch ${incomingEpoch}. Active epoch is ${this.ctx.currentEpoch}.`,
                        }),
                        {
                            headers: { 'Content-Type': 'application/json' },
                            status: 409,
                        },
                    )
                }

                if (!headSha) {
                    return new Response(
                        JSON.stringify({ error: 'MISSING_HEAD_SHA' }),
                        {
                            headers: { 'Content-Type': 'application/json' },
                            status: 400,
                        },
                    )
                }

                await this.applyTransition(
                    'SUBMIT_VERIFY',
                    {
                        type: 'REMOTE_WORKER',
                        workerId: body?.workerId || 'worker-rpc',
                        epoch: incomingEpoch,
                    },
                    { headSha },
                )

                return new Response(
                    JSON.stringify({
                        ok: true,
                        state: this.currentState,
                        promotedHeadSha: headSha,
                        epoch: this.ctx.currentEpoch,
                    }),
                    {
                        headers: { 'Content-Type': 'application/json' },
                        status: 200,
                    },
                )
            }

            return new Response(JSON.stringify({ error: 'NOT_FOUND' }), {
                status: 404,
            })
        } catch (err: any) {
            const isDomainError =
                err.message.includes('ILLEGAL_FSM_TRANSITION') ||
                err.message.includes('UNAUTHORIZED_OR_GUARD_FAILED') ||
                err.message.includes('STALE_WORKER_EPOCH') ||
                err.message.includes('AMBIGUOUS_TRANSITION_ERROR')

            return new Response(
                JSON.stringify({
                    error: err.message,
                    currentState: this.currentState,
                }),
                {
                    headers: { 'Content-Type': 'application/json' },
                    status: isDomainError ? 409 : 500,
                },
            )
        }
    }
}
