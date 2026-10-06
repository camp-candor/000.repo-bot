export type TaskState =
    | 'PENDING'
    | 'CLAIMED'
    | 'RUNNING'
    | 'VERIFYING'
    | 'SCOPE_PASSED'
    | 'AWAITING_APPROVAL'
    | 'MERGING'
    | 'MERGED'
    | 'RETRYING'
    | 'ROLLING_BACK'
    | 'ROLLED_BACK'
    | 'DLQ'
    | 'HALTED'

export type FSMEvent =
    | 'LEASE_CLAIMED'
    | 'WORKER_ACK'
    | 'SUBMIT_VERIFY'
    | 'SCOPE_PASS'
    | 'QUALITY_PASS'
    | 'QUALITY_FAIL_RETRY'
    | 'SECURITY_VIOLATION'
    | 'NEW_HEAD_PUSHED'
    | 'HUMAN_APPROVE'
    | 'HUMAN_REJECT'
    | 'APPROVAL_TIMEOUT'
    | 'WATCHDOG_EXPIRE'
    | 'ABSOLUTE_TIMEOUT'
    | 'VERIFICATION_TIMEOUT'
    | 'MERGE_TIMEOUT'
    | 'ROLLBACK_TIMEOUT'
    | 'KILL_SWITCH_TRIP'
    | 'BUDGET_EXHAUSTED'
    | 'OPERATOR_CANCEL'
    | 'OPERATOR_RESUME'
    | 'OPERATOR_REQUEUE'
    | 'MERGE_SUCCEEDED'
    | 'MERGE_FAILED_HEAD_MOVED'
    | 'MERGE_FAILED_CONFLICT'
    | 'ROLLBACK_COMPLETE'
    | 'WORKER_ABORT'
    | 'RECONCILER_EXPIRY'

export type AuthenticatedActor =
    | { type: 'SYSTEM_INTERNAL' }
    | { type: 'REMOTE_WORKER'; workerId: string; epoch: number }
    | { type: 'AUDIT_ENGINE' }
    | { type: 'LEAD_ARCHITECT'; userId: string }

export interface FSMContext {
    taskId: string
    currentEpoch: number
    attemptCount: number
    maxAttempts: number
    isHighRiskPath: boolean
    auditedHeadSha?: string
    candidateHeadSha?: string
    scopeCheckPassed: boolean
    qualityCheckPassed: boolean
    branchName: string
    prNumber?: number
    targetRepo: string
    baseCommitSha: string
    rollbackClass?: 'SECURITY' | 'INFRASTRUCTURE' | 'QUALITY' | 'HUMAN'
    rollbackReason?: string
}

export interface TransitionResult {
    nextState: TaskState
    contextPatch?: Partial<FSMContext>
    isNoop?: boolean
}

export interface TransitionRule {
    from: TaskState
    event: FSMEvent
    to: TaskState
    authorizedActorTypes: Array<AuthenticatedActor['type']>
    guard?: (ctx: FSMContext, payload?: any) => boolean
    producePatch?: (ctx: FSMContext, payload?: any) => Partial<FSMContext>
}

export const TRANSITION_TABLE: TransitionRule[] = [
    // Dispatch & Worker Initialization
    {
        from: 'PENDING',
        event: 'LEASE_CLAIMED',
        to: 'CLAIMED',
        authorizedActorTypes: ['SYSTEM_INTERNAL'],
        producePatch: (ctx) => ({
            currentEpoch: ctx.currentEpoch + 1,
        }),
    },
    {
        from: 'CLAIMED',
        event: 'WORKER_ACK',
        to: 'RUNNING',
        authorizedActorTypes: ['REMOTE_WORKER'],
    },
    {
        from: 'CLAIMED',
        event: 'WATCHDOG_EXPIRE',
        to: 'ROLLING_BACK',
        authorizedActorTypes: ['SYSTEM_INTERNAL'],
        producePatch: () => ({
            rollbackClass: 'INFRASTRUCTURE',
            rollbackReason: 'CLAIMED_BOOT_TIMEOUT',
        }),
    },
    {
        from: 'CLAIMED',
        event: 'WORKER_ABORT',
        to: 'ROLLING_BACK',
        authorizedActorTypes: ['REMOTE_WORKER'],
        producePatch: (_, p) => ({
            rollbackClass: 'INFRASTRUCTURE',
            rollbackReason: p?.reason || 'WORKER_ABORT',
        }),
    },
    {
        from: 'CLAIMED',
        event: 'SECURITY_VIOLATION',
        to: 'ROLLING_BACK',
        authorizedActorTypes: ['AUDIT_ENGINE'],
        producePatch: (_, p) => ({
            rollbackClass: 'SECURITY',
            rollbackReason: p?.reason || 'SECURITY_VIOLATION',
        }),
    },

    // Active Execution Transitions
    {
        from: 'RUNNING',
        event: 'SUBMIT_VERIFY',
        to: 'VERIFYING',
        authorizedActorTypes: ['REMOTE_WORKER'],
        guard: (_, p) => Boolean(p?.headSha),
        producePatch: (_, p) => ({
            candidateHeadSha: p.headSha,
        }),
    },
    {
        from: 'RUNNING',
        event: 'WORKER_ABORT',
        to: 'ROLLING_BACK',
        authorizedActorTypes: ['REMOTE_WORKER'],
        producePatch: (_, p) => ({
            rollbackClass: 'INFRASTRUCTURE',
            rollbackReason: p?.reason || 'WORKER_ABORT',
        }),
    },
    {
        from: 'RUNNING',
        event: 'WATCHDOG_EXPIRE',
        to: 'RETRYING',
        authorizedActorTypes: ['SYSTEM_INTERNAL'],
        guard: (ctx) => ctx.attemptCount < ctx.maxAttempts,
        producePatch: (ctx) => ({
            currentEpoch: ctx.currentEpoch + 1,
            rollbackClass: 'INFRASTRUCTURE',
            rollbackReason: 'WATCHDOG_HEARTBEAT_TIMEOUT',
        }),
    },
    {
        from: 'RUNNING',
        event: 'WATCHDOG_EXPIRE',
        to: 'ROLLING_BACK',
        authorizedActorTypes: ['SYSTEM_INTERNAL'],
        guard: (ctx) => ctx.attemptCount >= ctx.maxAttempts,
        producePatch: (ctx) => ({
            currentEpoch: ctx.currentEpoch + 1,
            rollbackClass: 'INFRASTRUCTURE',
            rollbackReason: 'WATCHDOG_HEARTBEAT_TIMEOUT_EXHAUSTED',
        }),
    },
    {
        from: 'RUNNING',
        event: 'ABSOLUTE_TIMEOUT',
        to: 'ROLLING_BACK',
        authorizedActorTypes: ['SYSTEM_INTERNAL'],
        producePatch: () => ({
            rollbackClass: 'INFRASTRUCTURE',
            rollbackReason: 'TASK_ABSOLUTE_TIMEOUT_15M',
        }),
    },
    {
        from: 'RUNNING',
        event: 'SECURITY_VIOLATION',
        to: 'ROLLING_BACK',
        authorizedActorTypes: ['AUDIT_ENGINE'],
        producePatch: (_, p) => ({
            rollbackClass: 'SECURITY',
            rollbackReason: p?.reason || 'SECURITY_VIOLATION',
        }),
    },
    {
        from: 'RUNNING',
        event: 'NEW_HEAD_PUSHED',
        to: 'RUNNING',
        authorizedActorTypes: ['AUDIT_ENGINE'],
        guard: (_, p) => Boolean(p?.headSha),
        producePatch: (_, p) => ({
            candidateHeadSha: p.headSha,
        }),
    },

    // Verification Gauntlet: Scope -> Quality -> Merging
    {
        from: 'VERIFYING',
        event: 'SCOPE_PASS',
        to: 'SCOPE_PASSED',
        authorizedActorTypes: ['AUDIT_ENGINE'],
        guard: (ctx, p) =>
            Boolean(p?.headSha) && p.headSha === ctx.candidateHeadSha,
        producePatch: (ctx, p) => ({
            scopeCheckPassed: true,
            isHighRiskPath: p?.isHighRiskPath ?? ctx.isHighRiskPath,
            auditedHeadSha: p.headSha,
        }),
    },
    {
        from: 'VERIFYING',
        event: 'SECURITY_VIOLATION',
        to: 'ROLLING_BACK',
        authorizedActorTypes: ['AUDIT_ENGINE'],
        producePatch: (_, p) => ({
            rollbackClass: 'SECURITY',
            rollbackReason: p?.reason || 'SECURITY_VIOLATION',
        }),
    },
    {
        from: 'VERIFYING',
        event: 'VERIFICATION_TIMEOUT',
        to: 'ROLLING_BACK',
        authorizedActorTypes: ['SYSTEM_INTERNAL'],
        producePatch: () => ({
            rollbackClass: 'INFRASTRUCTURE',
            rollbackReason: 'VERIFICATION_GAUNTLET_TIMEOUT',
        }),
    },
    {
        from: 'VERIFYING',
        event: 'NEW_HEAD_PUSHED',
        to: 'VERIFYING',
        authorizedActorTypes: ['AUDIT_ENGINE'],
        guard: (_, p) => Boolean(p?.headSha),
        producePatch: (_, p) => ({
            candidateHeadSha: p.headSha,
            scopeCheckPassed: false,
            qualityCheckPassed: false,
            auditedHeadSha: undefined,
        }),
    },

    // Synchronize Events Invalidating Prior Checks
    {
        from: 'SCOPE_PASSED',
        event: 'NEW_HEAD_PUSHED',
        to: 'VERIFYING',
        authorizedActorTypes: ['AUDIT_ENGINE'],
        guard: (_, p) => Boolean(p?.headSha),
        producePatch: (_, p) => ({
            candidateHeadSha: p.headSha,
            scopeCheckPassed: false,
            qualityCheckPassed: false,
            auditedHeadSha: undefined,
        }),
    },
    {
        from: 'AWAITING_APPROVAL',
        event: 'NEW_HEAD_PUSHED',
        to: 'VERIFYING',
        authorizedActorTypes: ['AUDIT_ENGINE'],
        guard: (_, p) => Boolean(p?.headSha),
        producePatch: (_, p) => ({
            candidateHeadSha: p.headSha,
            scopeCheckPassed: false,
            qualityCheckPassed: false,
            auditedHeadSha: undefined,
        }),
    },

    // Quality Pass Routing: Low-Risk -> MERGING, High-Risk -> AWAITING_APPROVAL
    {
        from: 'SCOPE_PASSED',
        event: 'QUALITY_PASS',
        to: 'MERGING',
        authorizedActorTypes: ['AUDIT_ENGINE'],
        guard: (ctx, p) =>
            !ctx.isHighRiskPath &&
            ctx.scopeCheckPassed &&
            Boolean(p?.headSha) &&
            p.headSha === ctx.auditedHeadSha,
        producePatch: () => ({ qualityCheckPassed: true }),
    },
    {
        from: 'SCOPE_PASSED',
        event: 'QUALITY_PASS',
        to: 'AWAITING_APPROVAL',
        authorizedActorTypes: ['AUDIT_ENGINE'],
        guard: (ctx, p) =>
            ctx.isHighRiskPath &&
            ctx.scopeCheckPassed &&
            Boolean(p?.headSha) &&
            p.headSha === ctx.auditedHeadSha,
        producePatch: () => ({ qualityCheckPassed: true }),
    },
    {
        from: 'SCOPE_PASSED',
        event: 'QUALITY_FAIL_RETRY',
        to: 'RETRYING',
        authorizedActorTypes: ['AUDIT_ENGINE'],
        guard: (ctx, p) =>
            ctx.attemptCount < ctx.maxAttempts &&
            Boolean(p?.headSha) &&
            p.headSha === ctx.auditedHeadSha,
        producePatch: () => ({
            rollbackClass: 'QUALITY',
            rollbackReason: 'QUALITY_GAUNTLET_FAILED',
        }),
    },
    {
        from: 'SCOPE_PASSED',
        event: 'QUALITY_FAIL_RETRY',
        to: 'ROLLING_BACK',
        authorizedActorTypes: ['AUDIT_ENGINE'],
        guard: (ctx, p) =>
            ctx.attemptCount >= ctx.maxAttempts &&
            Boolean(p?.headSha) &&
            p.headSha === ctx.auditedHeadSha,
        producePatch: () => ({
            rollbackClass: 'QUALITY',
            rollbackReason: 'QUALITY_GAUNTLET_FAILED_EXHAUSTED',
        }),
    },
    {
        from: 'SCOPE_PASSED',
        event: 'SECURITY_VIOLATION',
        to: 'ROLLING_BACK',
        authorizedActorTypes: ['AUDIT_ENGINE'],
        producePatch: (_, p) => ({
            rollbackClass: 'SECURITY',
            rollbackReason: p?.reason || 'SECURITY_VIOLATION',
        }),
    },
    {
        from: 'SCOPE_PASSED',
        event: 'VERIFICATION_TIMEOUT',
        to: 'ROLLING_BACK',
        authorizedActorTypes: ['SYSTEM_INTERNAL'],
        producePatch: () => ({
            rollbackClass: 'INFRASTRUCTURE',
            rollbackReason: 'VERIFICATION_GAUNTLET_TIMEOUT',
        }),
    },

    // Human Gate
    {
        from: 'AWAITING_APPROVAL',
        event: 'HUMAN_APPROVE',
        to: 'MERGING',
        authorizedActorTypes: ['LEAD_ARCHITECT'],
        guard: (ctx, p) =>
            ctx.auditedHeadSha !== undefined &&
            ctx.candidateHeadSha !== undefined &&
            ctx.auditedHeadSha === ctx.candidateHeadSha &&
            (p?.approvedHeadSha === undefined ||
                p.approvedHeadSha === ctx.auditedHeadSha) &&
            ctx.qualityCheckPassed &&
            ctx.scopeCheckPassed,
    },
    {
        from: 'AWAITING_APPROVAL',
        event: 'HUMAN_REJECT',
        to: 'ROLLING_BACK',
        authorizedActorTypes: ['LEAD_ARCHITECT'],
        producePatch: () => ({
            rollbackClass: 'HUMAN',
            rollbackReason: 'HUMAN_ARCHITECT_REJECTED',
        }),
    },
    {
        from: 'AWAITING_APPROVAL',
        event: 'APPROVAL_TIMEOUT',
        to: 'HALTED',
        authorizedActorTypes: ['SYSTEM_INTERNAL'],
        producePatch: () => ({
            rollbackReason: 'APPROVAL_WINDOW_EXPIRED_24H',
        }),
    },
    {
        from: 'AWAITING_APPROVAL',
        event: 'SECURITY_VIOLATION',
        to: 'ROLLING_BACK',
        authorizedActorTypes: ['AUDIT_ENGINE'],
        producePatch: (_, p) => ({
            rollbackClass: 'SECURITY',
            rollbackReason: p?.reason || 'SECURITY_VIOLATION',
        }),
    },

    // Merge Execution Stage
    {
        from: 'MERGING',
        event: 'MERGE_SUCCEEDED',
        to: 'MERGED',
        authorizedActorTypes: ['SYSTEM_INTERNAL'],
    },
    {
        from: 'MERGING',
        event: 'MERGE_FAILED_HEAD_MOVED',
        to: 'VERIFYING',
        authorizedActorTypes: ['SYSTEM_INTERNAL'],
        producePatch: () => ({
            scopeCheckPassed: false,
            qualityCheckPassed: false,
            auditedHeadSha: undefined,
        }),
    },
    {
        from: 'MERGING',
        event: 'MERGE_FAILED_CONFLICT',
        to: 'RETRYING',
        authorizedActorTypes: ['SYSTEM_INTERNAL'],
        guard: (ctx) => ctx.attemptCount < ctx.maxAttempts,
        producePatch: () => ({
            rollbackClass: 'QUALITY',
            rollbackReason: 'GIT_MERGE_CONFLICT_REQUIRES_REBASE',
            scopeCheckPassed: false,
            qualityCheckPassed: false,
            auditedHeadSha: undefined,
        }),
    },
    {
        from: 'MERGING',
        event: 'MERGE_FAILED_CONFLICT',
        to: 'ROLLING_BACK',
        authorizedActorTypes: ['SYSTEM_INTERNAL'],
        guard: (ctx) => ctx.attemptCount >= ctx.maxAttempts,
        producePatch: () => ({
            rollbackClass: 'QUALITY',
            rollbackReason: 'GIT_MERGE_CONFLICT_EXHAUSTED',
        }),
    },
    {
        from: 'MERGING',
        event: 'SECURITY_VIOLATION',
        to: 'ROLLING_BACK',
        authorizedActorTypes: ['SYSTEM_INTERNAL'],
        producePatch: (_, p) => ({
            rollbackClass: 'SECURITY',
            rollbackReason: p?.reason || 'SECURITY_VIOLATION',
        }),
    },
    {
        from: 'MERGING',
        event: 'MERGE_TIMEOUT',
        to: 'ROLLING_BACK',
        authorizedActorTypes: ['SYSTEM_INTERNAL'],
        producePatch: () => ({
            rollbackClass: 'INFRASTRUCTURE',
            rollbackReason: 'MERGE_EXECUTION_TIMEOUT',
        }),
    },

    // Retry Progression
    {
        from: 'RETRYING',
        event: 'SECURITY_VIOLATION',
        to: 'ROLLING_BACK',
        authorizedActorTypes: ['AUDIT_ENGINE', 'SYSTEM_INTERNAL'],
        producePatch: (_, p) => ({
            rollbackClass: 'SECURITY',
            rollbackReason: p?.reason || 'SECURITY_VIOLATION',
        }),
    },
    {
        from: 'RETRYING',
        event: 'LEASE_CLAIMED',
        to: 'CLAIMED',
        authorizedActorTypes: ['SYSTEM_INTERNAL'],
        producePatch: (ctx) => ({
            attemptCount: ctx.attemptCount + 1,
            currentEpoch: ctx.rollbackReason?.startsWith('WATCHDOG')
                ? ctx.currentEpoch
                : ctx.currentEpoch + 1,
            branchName: `spec/${ctx.taskId.toLowerCase()}-attempt${ctx.attemptCount + 1}`,
            candidateHeadSha: undefined,
            auditedHeadSha: undefined,
            scopeCheckPassed: false,
            qualityCheckPassed: false,
            rollbackClass: undefined,
            rollbackReason: undefined,
        }),
    },

    // Rollback Progression & Terminal Dead-Lettering
    {
        from: 'ROLLING_BACK',
        event: 'ROLLBACK_TIMEOUT',
        to: 'DLQ',
        authorizedActorTypes: ['SYSTEM_INTERNAL'],
        producePatch: () => ({
            rollbackReason: 'ROLLBACK_EXECUTION_TIMEOUT',
        }),
    },
    {
        from: 'ROLLING_BACK',
        event: 'ROLLBACK_COMPLETE',
        to: 'DLQ',
        authorizedActorTypes: ['SYSTEM_INTERNAL'],
        guard: (ctx) =>
            ctx.rollbackClass === 'SECURITY' ||
            ctx.attemptCount >= ctx.maxAttempts,
    },
    {
        from: 'ROLLING_BACK',
        event: 'ROLLBACK_COMPLETE',
        to: 'RETRYING',
        authorizedActorTypes: ['SYSTEM_INTERNAL'],
        guard: (ctx) =>
            ctx.rollbackClass !== 'SECURITY' &&
            ctx.rollbackClass !== 'HUMAN' &&
            ctx.attemptCount < ctx.maxAttempts,
    },
    {
        from: 'ROLLING_BACK',
        event: 'ROLLBACK_COMPLETE',
        to: 'ROLLED_BACK',
        authorizedActorTypes: ['SYSTEM_INTERNAL'],
        guard: (ctx) =>
            ctx.rollbackClass === 'HUMAN' && ctx.attemptCount < ctx.maxAttempts,
    },
    {
        from: 'ROLLED_BACK',
        event: 'RECONCILER_EXPIRY',
        to: 'DLQ',
        authorizedActorTypes: ['SYSTEM_INTERNAL'],
    },
    {
        from: 'ROLLED_BACK',
        event: 'OPERATOR_RESUME',
        to: 'PENDING',
        authorizedActorTypes: ['LEAD_ARCHITECT'],
        producePatch: (ctx) => ({
            attemptCount: ctx.attemptCount + 1,
            branchName: `spec/${ctx.taskId.toLowerCase()}-attempt${ctx.attemptCount + 1}`,
            candidateHeadSha: undefined,
            auditedHeadSha: undefined,
            scopeCheckPassed: false,
            qualityCheckPassed: false,
            rollbackClass: undefined,
            rollbackReason: undefined,
        }),
    },

    // DLQ Manual Adjudication Path
    {
        from: 'DLQ',
        event: 'OPERATOR_REQUEUE',
        to: 'PENDING',
        authorizedActorTypes: ['LEAD_ARCHITECT'],
        producePatch: (ctx) => ({
            attemptCount: 1,
            branchName: `spec/${ctx.taskId.toLowerCase()}-requeue`,
            candidateHeadSha: undefined,
            auditedHeadSha: undefined,
            scopeCheckPassed: false,
            qualityCheckPassed: false,
            rollbackClass: undefined,
            rollbackReason: undefined,
        }),
    },

    // Emergency Halt: Valid from every active, non-terminal state
    ...(
        [
            'PENDING',
            'CLAIMED',
            'RUNNING',
            'VERIFYING',
            'SCOPE_PASSED',
            'AWAITING_APPROVAL',
            'RETRYING',
        ] as TaskState[]
    ).flatMap((state) => [
        {
            from: state,
            event: 'KILL_SWITCH_TRIP' as FSMEvent,
            to: 'HALTED' as TaskState,
            authorizedActorTypes: [
                'SYSTEM_INTERNAL' as const,
                'LEAD_ARCHITECT' as const,
            ],
        },
        {
            from: state,
            event: 'BUDGET_EXHAUSTED' as FSMEvent,
            to: 'HALTED' as TaskState,
            authorizedActorTypes: ['SYSTEM_INTERNAL' as const],
        },
        {
            from: state,
            event: 'OPERATOR_CANCEL' as FSMEvent,
            to: 'HALTED' as TaskState,
            authorizedActorTypes: ['LEAD_ARCHITECT' as const],
        },
    ]),
    {
        from: 'HALTED',
        event: 'OPERATOR_RESUME',
        to: 'PENDING',
        authorizedActorTypes: ['LEAD_ARCHITECT'],
        producePatch: (ctx) => ({
            attemptCount: ctx.attemptCount + 1,
            branchName: `spec/${ctx.taskId.toLowerCase()}-attempt${ctx.attemptCount + 1}`,
            candidateHeadSha: undefined,
            auditedHeadSha: undefined,
            scopeCheckPassed: false,
            qualityCheckPassed: false,
            rollbackClass: undefined,
            rollbackReason: undefined,
        }),
    },
]

const TRANSITION_MAP = new Map<string, TransitionRule[]>()
for (const rule of TRANSITION_TABLE) {
    const key = `${rule.from}:${rule.event}`
    const existing = TRANSITION_MAP.get(key) || []
    existing.push(rule)
    TRANSITION_MAP.set(key, existing)
}

export function evaluateTransition(
    currentState: TaskState,
    event: FSMEvent,
    actor: AuthenticatedActor,
    ctx: FSMContext,
    payload?: any,
): TransitionResult {
    // 1. Idempotent No-Op on Terminal States (Precedes worker epoch checks)
    if (
        ['MERGED', 'DLQ'].includes(currentState) &&
        event !== 'OPERATOR_REQUEUE'
    ) {
        return { nextState: currentState, isNoop: true }
    }

    // 2. Worker Epoch Fencing: Enforce epoch integrity for remote workers
    if (actor.type === 'REMOTE_WORKER') {
        if (actor.epoch !== ctx.currentEpoch) {
            throw new Error(
                `STALE_WORKER_EPOCH: Worker epoch (${actor.epoch}) does not match current epoch (${ctx.currentEpoch}).`,
            )
        }
    }

    const rules = TRANSITION_MAP.get(`${currentState}:${event}`)
    if (!rules || rules.length === 0) {
        throw new Error(
            `ILLEGAL_FSM_TRANSITION: Event '${event}' is not permitted from state '${currentState}'.`,
        )
    }

    const matchingRules = rules.filter((r) => {
        const actorAuthorized = r.authorizedActorTypes.includes(actor.type)
        const guardPassed = r.guard ? r.guard(ctx, payload) : true
        return actorAuthorized && guardPassed
    })

    if (matchingRules.length === 0) {
        throw new Error(
            `UNAUTHORIZED_OR_GUARD_FAILED: Transition '${currentState}' via '${event}' rejected for actor '${actor.type}'.`,
        )
    }

    if (matchingRules.length > 1) {
        throw new Error(
            `AMBIGUOUS_TRANSITION_ERROR: Multiple rules matched for '${currentState}' via '${event}'. Guards must partition context.`,
        )
    }

    const selectedRule = matchingRules[0]
    const patch = selectedRule.producePatch
        ? selectedRule.producePatch(ctx, payload)
        : undefined

    return { nextState: selectedRule.to, contextPatch: patch }
}
