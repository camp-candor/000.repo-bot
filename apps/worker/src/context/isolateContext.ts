import type { Env } from '../tools.js'

export interface ContextOptions {
    traceId?: string
    source?: string
}

export interface ScopedTelemetryEntry {
    timestampMs: number
    level: 'INFO' | 'WARN' | 'ERROR'
    tag: string
    message: string
}

export interface IsolateExecutionHook {
    waitUntil: (promise: Promise<any>) => void
}

export interface IsolateContext {
    readonly env: Env
    readonly executionCtx?: IsolateExecutionHook
    readonly traceId: string
    readonly startedAtMs: number
    readonly source: string

    // Scoped binding accessors (no ambient globals)
    getDb(): D1Database | undefined
    getGithubToken(): string
    getAiBinding(): unknown

    // Scoped Diagnostics Buffer
    log(tag: string, message: string): void
    warn(tag: string, message: string): void
    error(tag: string, message: string): void
    getTelemetryEntries(): readonly ScopedTelemetryEntry[]
    clearTelemetry(): void
}

/**
 * Creates an immutable, isolated execution context container with zero ambient globals.
 * All state (telemetry buffer, trace metadata) lives in this closure only.
 */
export function createIsolateContext(
    env: Env,
    executionCtx?: IsolateExecutionHook,
    options: ContextOptions = {},
): IsolateContext {
    if (!env) {
        throw new Error(
            'ISOLATE_CONTEXT_INIT_FAILED: Runtime env binding is required.',
        )
    }

    const startedAtMs = Date.now()
    const traceId =
        options.traceId ||
        `trc-${startedAtMs}-${Math.random().toString(36).slice(2, 8)}`
    const source = options.source || 'WORKER_DEFAULT'

    const telemetryBuffer: ScopedTelemetryEntry[] = []

    const appendEntry = (
        level: 'INFO' | 'WARN' | 'ERROR',
        tag: string,
        message: string,
    ): void => {
        const entry: ScopedTelemetryEntry = {
            timestampMs: Date.now(),
            level,
            tag,
            message,
        }
        telemetryBuffer.push(entry)
        const prefix = `>> [${level}:${tag}] [${traceId}]`
        if (level === 'ERROR') {
            console.error(`${prefix} ${message}`)
        } else if (level === 'WARN') {
            console.warn(`${prefix} ${message}`)
        } else {
            console.log(`${prefix} ${message}`)
        }
    }

    const ctx: IsolateContext = {
        env,
        executionCtx,
        traceId,
        startedAtMs,
        source,

        getDb() {
            return env.DB
        },
        getGithubToken() {
            if (!env.GITHUB_TOKEN) {
                throw new Error(
                    'ISOLATE_CONTEXT_BINDING_MISSING: GITHUB_TOKEN is not configured.',
                )
            }
            return env.GITHUB_TOKEN
        },
        getAiBinding() {
            return env.AI
        },

        log(tag: string, message: string) {
            appendEntry('INFO', tag, message)
        },
        warn(tag: string, message: string) {
            appendEntry('WARN', tag, message)
        },
        error(tag: string, message: string) {
            appendEntry('ERROR', tag, message)
        },
        getTelemetryEntries() {
            return Object.freeze([...telemetryBuffer])
        },
        clearTelemetry() {
            telemetryBuffer.length = 0
        },
    }

    return Object.freeze(ctx)
}
