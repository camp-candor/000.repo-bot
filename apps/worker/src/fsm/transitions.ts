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

export type TaskEvent =
    | 'CLAIM_LEASE'
    | 'ACK_RUNNING'
    | 'SUBMIT_VERIFICATION'
    | 'PASS_SCOPE'
    | 'PASS_QUALITY'
    | 'FAIL_QUALITY'
    | 'APPROVE'
    | 'REJECT'
    | 'CONFIRM_MERGE'
    | 'WATCHDOG_EXPIRE'
    | 'HALT'
    | 'RESUME'
    | 'RETRY'
    | 'ROLLBACK_COMPLETE'
    | 'EXHAUST_RETRIES'

export interface TransitionContext {
    attemptCount: number
    maxAttempts: number
    isHighRisk?: boolean
}

export interface TransitionResult {
    isValid: boolean
    nextState: TaskState
    isTerminalNoOp: boolean
    error?: string
}

const TERMINAL_STATES: ReadonlySet<TaskState> = new Set([
    'MERGED',
    'DLQ',
    'ROLLED_BACK',
])

const REVOKING_EVENTS: ReadonlySet<TaskEvent> = new Set([
    'WATCHDOG_EXPIRE',
    'FAIL_QUALITY',
    'REJECT',
    'HALT',
    'EXHAUST_RETRIES',
])

const PROMOTING_EVENTS: ReadonlySet<TaskEvent> = new Set([
    'SUBMIT_VERIFICATION',
    'PASS_SCOPE',
    'PASS_QUALITY',
    'APPROVE',
    'CONFIRM_MERGE',
])

export function isTerminalState(state: TaskState): boolean {
    return TERMINAL_STATES.has(state)
}

export function isRevokingEvent(event: TaskEvent): boolean {
    return REVOKING_EVENTS.has(event)
}

export function isPromotingEvent(event: TaskEvent): boolean {
    return PROMOTING_EVENTS.has(event)
}

/**
 * Pure state machine transition evaluator.
 */
export function evaluateFsmTransition(
    currentState: TaskState,
    event: TaskEvent,
    context: TransitionContext,
): TransitionResult {
    // 1. Terminal states treat late events as safe no-ops
    if (TERMINAL_STATES.has(currentState)) {
        return {
            isValid: true,
            nextState: currentState,
            isTerminalNoOp: true,
        }
    }

    // 2. Universal non-destructive HALT from any non-terminal state
    if (event === 'HALT') {
        return {
            isValid: true,
            nextState: 'HALTED',
            isTerminalNoOp: false,
        }
    }

    // 3. Resume from HALTED back to PENDING
    if (currentState === 'HALTED' && event === 'RESUME') {
        return {
            isValid: true,
            nextState: 'PENDING',
            isTerminalNoOp: false,
        }
    }

    switch (currentState) {
        case 'PENDING':
            if (event === 'CLAIM_LEASE') {
                return {
                    isValid: true,
                    nextState: 'CLAIMED',
                    isTerminalNoOp: false,
                }
            }
            break

        case 'CLAIMED':
            if (event === 'ACK_RUNNING') {
                return {
                    isValid: true,
                    nextState: 'RUNNING',
                    isTerminalNoOp: false,
                }
            }
            if (event === 'WATCHDOG_EXPIRE') {
                const nextState =
                    context.attemptCount + 1 >= context.maxAttempts
                        ? 'DLQ'
                        : 'RETRYING'
                return { isValid: true, nextState, isTerminalNoOp: false }
            }
            break

        case 'RUNNING':
            if (event === 'SUBMIT_VERIFICATION') {
                return {
                    isValid: true,
                    nextState: 'VERIFYING',
                    isTerminalNoOp: false,
                }
            }
            if (event === 'WATCHDOG_EXPIRE') {
                const nextState =
                    context.attemptCount + 1 >= context.maxAttempts
                        ? 'DLQ'
                        : 'RETRYING'
                return { isValid: true, nextState, isTerminalNoOp: false }
            }
            break

        case 'VERIFYING':
            if (event === 'PASS_SCOPE') {
                return {
                    isValid: true,
                    nextState: 'SCOPE_PASSED',
                    isTerminalNoOp: false,
                }
            }
            if (event === 'FAIL_QUALITY') {
                const nextState =
                    context.attemptCount + 1 >= context.maxAttempts
                        ? 'ROLLING_BACK'
                        : 'RETRYING'
                return { isValid: true, nextState, isTerminalNoOp: false }
            }
            break

        case 'SCOPE_PASSED':
            if (event === 'PASS_QUALITY') {
                const nextState = context.isHighRisk
                    ? 'AWAITING_APPROVAL'
                    : 'MERGING'
                return { isValid: true, nextState, isTerminalNoOp: false }
            }
            if (event === 'FAIL_QUALITY') {
                const nextState =
                    context.attemptCount + 1 >= context.maxAttempts
                        ? 'ROLLING_BACK'
                        : 'RETRYING'
                return { isValid: true, nextState, isTerminalNoOp: false }
            }
            break

        case 'AWAITING_APPROVAL':
            if (event === 'APPROVE') {
                return {
                    isValid: true,
                    nextState: 'MERGING',
                    isTerminalNoOp: false,
                }
            }
            if (event === 'REJECT') {
                return {
                    isValid: true,
                    nextState: 'ROLLING_BACK',
                    isTerminalNoOp: false,
                }
            }
            break

        case 'MERGING':
            if (event === 'CONFIRM_MERGE') {
                return {
                    isValid: true,
                    nextState: 'MERGED',
                    isTerminalNoOp: false,
                }
            }
            break

        case 'RETRYING':
            if (event === 'RETRY') {
                return {
                    isValid: true,
                    nextState: 'PENDING',
                    isTerminalNoOp: false,
                }
            }
            if (event === 'EXHAUST_RETRIES') {
                return {
                    isValid: true,
                    nextState: 'DLQ',
                    isTerminalNoOp: false,
                }
            }
            break

        case 'ROLLING_BACK':
            if (event === 'ROLLBACK_COMPLETE') {
                return {
                    isValid: true,
                    nextState: 'ROLLED_BACK',
                    isTerminalNoOp: false,
                }
            }
            break

        default:
            break
    }

    return {
        isValid: false,
        nextState: currentState,
        isTerminalNoOp: false,
        error: `ILLEGAL_STATE_TRANSITION: Event '${event}' is invalid from state '${currentState}'.`,
    }
}
