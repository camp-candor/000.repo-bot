import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createIsolateContext } from '../../src/context/isolateContext.js'
import {
    createMemoryTripwire,
    estimateObjectSizeBytes,
    DEFAULT_OOM_TRIPWIRE_THRESHOLD_BYTES,
    MAX_SINGLE_PAYLOAD_BYTES,
} from '../../src/telemetry/oomTripwire.js'
import type { Env } from '../../src/tools.js'

describe('Isolate Memory Hygiene & Context Segregation Battery (Phase 3)', () => {
    const mockEnvA = {
        GITHUB_TOKEN: 'ghp_token_alpha',
        CLOUDFLARE_ACCOUNT_ID: 'acc_alpha',
    } as unknown as Env

    const mockEnvB = {
        GITHUB_TOKEN: 'ghp_token_beta',
        CLOUDFLARE_ACCOUNT_ID: 'acc_beta',
    } as unknown as Env

    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {})
        vi.spyOn(console, 'warn').mockImplementation(() => {})
        vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('TASK-3.1 & INV-1: Cross-Context Memory Segregation (Zero-Bleed Assertion)', () => {
        const ctxAlpha = createIsolateContext(mockEnvA, undefined, {
            traceId: 'trc-alpha',
            source: 'ROUTE_A',
        })
        const ctxBeta = createIsolateContext(mockEnvB, undefined, {
            traceId: 'trc-beta',
            source: 'ROUTE_B',
        })

        expect(ctxAlpha.traceId).toBe('trc-alpha')
        expect(ctxBeta.traceId).toBe('trc-beta')
        expect(ctxAlpha.env.GITHUB_TOKEN).toBe('ghp_token_alpha')
        expect(ctxBeta.env.GITHUB_TOKEN).toBe('ghp_token_beta')
        expect(ctxAlpha.getGithubToken()).toBe('ghp_token_alpha')
        expect(ctxBeta.getGithubToken()).toBe('ghp_token_beta')

        for (let i = 0; i < 10; i++) {
            ctxAlpha.log('INGRESS', `Event ${i} processed`)
        }

        expect(ctxAlpha.getTelemetryEntries()).toHaveLength(10)
        expect(ctxBeta.getTelemetryEntries()).toHaveLength(0)

        for (const entry of ctxAlpha.getTelemetryEntries()) {
            expect(entry.message).not.toContain('trc-beta')
        }

        ctxBeta.warn('RATE_LIMIT', 'Quota warning')
        expect(ctxAlpha.getTelemetryEntries()).toHaveLength(10)
        expect(ctxBeta.getTelemetryEntries()).toHaveLength(1)

        ctxAlpha.clearTelemetry()
        expect(ctxAlpha.getTelemetryEntries()).toHaveLength(0)
        expect(ctxBeta.getTelemetryEntries()).toHaveLength(1)
    })

    it('TASK-3.1 & INV-2: Global Namespace Immutability across multiple contexts', () => {
        const initialGlobals = Object.keys(globalThis).sort()

        const contexts = []
        for (let i = 0; i < 10; i++) {
            const ctx = createIsolateContext(mockEnvA, undefined, {
                traceId: `trc-batch-${i}`,
            })
            ctx.log('PROBE', `Batch probe ${i}`)
            contexts.push(ctx)
        }

        const postInitGlobals = Object.keys(globalThis).sort()
        expect(postInitGlobals).toEqual(initialGlobals)
        expect(contexts).toHaveLength(10)
    })

    it('TASK-3.1: returns an immutable context record and fails closed on missing env', () => {
        const ctx = createIsolateContext(mockEnvA)
        expect(Object.isFrozen(ctx)).toBe(true)
        expect(Object.isFrozen(ctx.getTelemetryEntries())).toBe(true)
        expect(() => {
            ;(ctx as unknown as { traceId: string }).traceId = 'hijacked'
        }).toThrow()

        expect(() => createIsolateContext(undefined as unknown as Env)).toThrow(
            /ISOLATE_CONTEXT_INIT_FAILED/,
        )

        const bare = createIsolateContext({} as unknown as Env)
        expect(() => bare.getGithubToken()).toThrow(
            /ISOLATE_CONTEXT_BINDING_MISSING/,
        )
    })

    it('TASK-3.2 & INV-3: Structural Sizing & Cycle Termination', () => {
        // Primitive sizing
        expect(estimateObjectSizeBytes(1234)).toBe(8)
        expect(estimateObjectSizeBytes('hello')).toBe(10) // 5 chars * 2 bytes
        expect(estimateObjectSizeBytes(true)).toBe(4)
        expect(estimateObjectSizeBytes(null)).toBe(0)

        // TypedArray / ArrayBuffer sizing
        const buffer = new Uint8Array(1024)
        expect(estimateObjectSizeBytes(buffer)).toBe(1024)
        expect(estimateObjectSizeBytes(new ArrayBuffer(2048))).toBe(2048)

        // Nested JSON record
        expect(estimateObjectSizeBytes({ a: 1, b: [true] })).toBe(
            32 + (2 + 8 + 8) + (2 + 8 + (32 + 8 + 4)),
        )

        // Cyclic structure detection: nodeA.next = nodeB; nodeB.prev = nodeA
        const nodeA: any = { name: 'nodeA' }
        const nodeB: any = { name: 'nodeB' }
        nodeA.next = nodeB
        nodeB.prev = nodeA

        const startTime = performance.now()
        const calculatedSize = estimateObjectSizeBytes(nodeA)
        const elapsedMs = performance.now() - startTime

        expect(elapsedMs).toBeLessThan(50) // safely under timeout bound
        expect(Number.isInteger(calculatedSize)).toBe(true)
        expect(calculatedSize).toBeGreaterThan(0)
    })

    it('TASK-3.2 & INV-4: Oversized Single Payload Rejection', () => {
        const tripwire = createMemoryTripwire()
        const oversizedBytes = MAX_SINGLE_PAYLOAD_BYTES + 1024 * 1024 // 33 MB > 32 MB limit

        expect(() => {
            tripwire.reserve(oversizedBytes)
        }).toThrow(/SINGLE_PAYLOAD_EXCEEDS_CEILING/)
        expect(tripwire.getAllocatedBytes()).toBe(0)

        expect(() => tripwire.reserve(-5)).toThrow(/INVALID_RESERVATION/)
        expect(() => tripwire.reserve(Number.NaN)).toThrow(
            /INVALID_RESERVATION/,
        )
        expect(tripwire.getAllocatedBytes()).toBe(0)
    })

    it('TASK-3.2 & INV-5: Cumulative Headroom Tripwire & Alert Callback', () => {
        const alertHook = vi.fn()
        const tripwire = createMemoryTripwire({
            tripwireThresholdBytes: 50_000,
            maxSinglePayloadBytes: 40_000,
            onTripwireExceeded: alertHook,
        })

        // Reserve 30,000 bytes (succeeds)
        tripwire.reserve(30_000)
        expect(tripwire.getAllocatedBytes()).toBe(30_000)
        expect(alertHook).not.toHaveBeenCalled()

        // Attempting to reserve another 25,000 bytes pushes total to 55,000 > 50,000
        expect(() => {
            tripwire.reserve(25_000)
        }).toThrow(/TRIPWIRE_LIMIT_BREACHED/)

        expect(alertHook).toHaveBeenCalledTimes(1)
        expect(alertHook).toHaveBeenCalledWith(55_000, 50_000)
        expect(tripwire.getAllocatedBytes()).toBe(30_000) // Unaltered allocation state
    })

    it('TASK-3.2: still fails closed when the alert hook itself throws', () => {
        const tripwire = createMemoryTripwire({
            tripwireThresholdBytes: 100,
            onTripwireExceeded: () => {
                throw new Error('OPS_BRIDGE_DOWN')
            },
        })
        expect(() => tripwire.reserve(101)).toThrow(
            /ISOLATE_MEMORY_BUDGET_EXCEEDED/,
        )
        expect(tripwire.getAllocatedBytes()).toBe(0)
    })

    it('TASK-3.2 & INV-6: Lifecycle Accounting & Clamped Releases', () => {
        const tripwire = createMemoryTripwire({
            tripwireThresholdBytes: DEFAULT_OOM_TRIPWIRE_THRESHOLD_BYTES,
        })

        const tenMb = 10 * 1024 * 1024
        const twentyMb = 20 * 1024 * 1024
        const fiftyMb = 50 * 1024 * 1024

        tripwire.reserve(tenMb)
        expect(tripwire.getAllocatedBytes()).toBe(tenMb)

        tripwire.reserve(twentyMb)
        expect(tripwire.getAllocatedBytes()).toBe(tenMb + twentyMb)

        tripwire.release(tenMb)
        expect(tripwire.getAllocatedBytes()).toBe(twentyMb)

        // Over-release clamps at zero
        tripwire.release(fiftyMb)
        expect(tripwire.getAllocatedBytes()).toBe(0)

        // Object-based reservation uses the sizing engine
        tripwire.reserve({ payload: 'abcd' })
        expect(tripwire.getAllocatedBytes()).toBe(
            estimateObjectSizeBytes({ payload: 'abcd' }),
        )

        tripwire.reset()
        expect(tripwire.getAllocatedBytes()).toBe(0)
    })
})
