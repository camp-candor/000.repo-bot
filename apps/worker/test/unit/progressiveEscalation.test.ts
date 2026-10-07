import { describe, it, expect } from 'vitest'
import {
    ProgressiveEscalationEngine,
    type EscalationContext,
} from '../../src/escalation/progressiveEscalation.js'
import {
    buildStoryArchitectDossier,
    formatDossierForChatOps,
} from '../../src/escalation/storyArchitectDossier.js'
import type { ExecutionJob } from '../../src/queue/fairQueue.js'
import type { VlmAuditReport } from '../../src/triage/visualScanTrace.js'
import { ShotCoordinatorDO } from '../../src/objects/ShotCoordinatorDO.js'

class MockDurableObjectStorage {
    public store = new Map<string, any>()
    public activeAlarm: number | null = null

    async get(key: string): Promise<any> {
        return this.store.get(key)
    }

    async put(key: string, value: any): Promise<void> {
        this.store.set(key, value)
    }

    async delete(key: string): Promise<void> {
        this.store.delete(key)
    }

    async setAlarm(timeMs: number): Promise<void> {
        this.activeAlarm = timeMs
    }

    async deleteAlarm(): Promise<void> {
        this.activeAlarm = null
    }
}

class MockDurableObjectContext {
    public storage = new MockDurableObjectStorage()

    blockConcurrencyWhile(fn: () => Promise<any>): Promise<any> {
        return fn()
    }
}

describe('Three-Tier Progressive Escalation Protocol Battery (Phase 3)', () => {
    const baseJob: ExecutionJob = {
        taskId: 'shot-prog-01',
        artistId: 'artist_beta',
        idempotencyKey: 'idemp_prog_01',
        workflowTemplate: 'wan_t2v.json',
        prompts: {
            positive: 'A warrior standing on castle wall, dawn light',
            negative: 'blurry, distorted',
        },
        seeds: [42],
        enqueuedAt: 1000,
        attemptCount: 1,
        maxAttempts: 3,
    }

    const mockReport: VlmAuditReport = {
        scanTrace: {
            eyelineCoordinates: [[0.5, 0.4]],
            mouthBoundingBox: {
                xMin: 0.45,
                yMin: 0.55,
                xMax: 0.55,
                yMax: 0.65,
            },
            propContourBounds: [],
            luminanceDelta: 0.05,
            lineSharpnessScore: 0.8,
            anachronismsDetected: [],
        },
        classification: 'LIGHTING_CURVE_SHIFT',
        rationale: 'Shadows clipped in high contrast regions.',
    }

    it('Invariant 1: Attempt 1 routes strictly to Tier 1 Micro-Prompt synthesis', () => {
        const engine = new ProgressiveEscalationEngine()
        const context: EscalationContext = {
            taskId: 'shot-prog-01',
            candidateSha: 'sha_test_01',
            attemptCount: 1,
            maxAttempts: 3,
            trajectory: 'CONVERGENCE',
            auditHistory: [
                {
                    attempt: 1,
                    classification: 'LIGHTING_CURVE_SHIFT',
                    errorTokens: [],
                    timestampMs: 1000,
                },
            ],
            latestReport: mockReport,
            currentJob: baseJob,
        }

        const directive = engine.evaluateEscalation(context)

        expect(directive.tier).toBe('TIER_1_MICRO_PROMPT')
        expect(directive.action).toBe('RETRY_MICRO_PATCH')
        expect(directive.remediatedJob?.attemptCount).toBe(2)
        expect(directive.remediatedJob?.seeds?.[0]).toBe(42 + 1013)
        expect(directive.remediatedJob?.prompts?.seed).toBe(42 + 1013)
        expect(directive.remediatedJob?.prompts?.escalationTier).toBe(
            'TIER_1_MICRO_PROMPT',
        )
        expect(directive.remediatedJob?.prompts?.lastRemediationDiff).toContain(
            '[Tier 1 Micro]',
        )
    })

    it('Invariant 2: Attempt 2 routes strictly to Tier 2 Macro-Workflow AST reconditioning', () => {
        const engine = new ProgressiveEscalationEngine()
        const mockWorkflow = {
            '3': {
                class_type: 'KSampler',
                inputs: {
                    cfg: 7.0,
                    steps: 20,
                    denoise: 1.0,
                },
            },
        }

        const context: EscalationContext = {
            taskId: 'shot-prog-01',
            candidateSha: 'sha_test_02',
            attemptCount: 2,
            maxAttempts: 3,
            trajectory: 'CONVERGENCE',
            auditHistory: [
                {
                    attempt: 1,
                    classification: 'LIGHTING_CURVE_SHIFT',
                    errorTokens: [],
                    timestampMs: 1000,
                },
                {
                    attempt: 2,
                    classification: 'LIGHTING_CURVE_SHIFT',
                    errorTokens: [],
                    timestampMs: 2000,
                },
            ],
            latestReport: mockReport,
            currentWorkflow: mockWorkflow,
            currentJob: { ...baseJob, attemptCount: 2 },
        }

        const directive = engine.evaluateEscalation(context)

        expect(directive.tier).toBe('TIER_2_AST_RECONDITION')
        expect(directive.action).toBe('RETRY_MACRO_AST')
        expect(directive.remediatedJob?.attemptCount).toBe(3)
        expect(directive.remediatedJob?.prompts?.escalationTier).toBe(
            'TIER_2_AST_RECONDITION',
        )
        expect(directive.remediatedJob?.prompts?.lastRemediationDiff).toContain(
            '[Tier 2 Macro AST]',
        )

        const updatedWorkflow = directive.remediatedJob?.prompts?.workflowAst
        expect(updatedWorkflow).toBeDefined()
        expect(updatedWorkflow['3'].inputs.cfg).toBe(7.5) // +0.5 CFG boost
        expect(updatedWorkflow['3'].inputs.steps).toBe(25) // +5 Sampler steps
        expect(updatedWorkflow['3'].inputs.denoise).toBeLessThanOrEqual(0.95) // clamped denoise
    })

    it('Invariant 3: Attempt 3 exhausts attempt budget and freezes into Tier 3 Quarantine', () => {
        const engine = new ProgressiveEscalationEngine()
        const context: EscalationContext = {
            taskId: 'shot-prog-01',
            candidateSha: 'sha_test_03',
            attemptCount: 3,
            maxAttempts: 3,
            trajectory: 'CONVERGENCE',
            auditHistory: [
                {
                    attempt: 1,
                    classification: 'LIGHTING_CURVE_SHIFT',
                    errorTokens: [],
                    timestampMs: 1000,
                },
                {
                    attempt: 2,
                    classification: 'LIGHTING_CURVE_SHIFT',
                    errorTokens: [],
                    timestampMs: 2000,
                },
                {
                    attempt: 3,
                    classification: 'LIGHTING_CURVE_SHIFT',
                    errorTokens: [],
                    timestampMs: 3000,
                },
            ],
            latestReport: mockReport,
            currentJob: { ...baseJob, attemptCount: 3 },
            ledgerHeadHash: 'abc123456789deadbeef',
        }

        const directive = engine.evaluateEscalation(context)

        expect(directive.tier).toBe('TIER_3_ARCHITECT_ESCALATION')
        expect(directive.action).toBe('FREEZE_AND_QUARANTINE')
        expect(directive.dossier).toBeDefined()
        expect(directive.dossier?.escalationTrigger).toBe(
            'MAX_ATTEMPTS_EXHAUSTED',
        )
        expect(directive.dossier?.status).toBe('BLOCKED')
        expect(directive.remediatedJob).toBeUndefined() // Zero re-enqueue
    })

    it('Invariant 4: Structural divergence at Cycle 2 immediately bypasses Tier 2 and jumps to Tier 3', () => {
        const engine = new ProgressiveEscalationEngine()
        const context: EscalationContext = {
            taskId: 'shot-prog-01',
            candidateSha: 'sha_test_div',
            attemptCount: 2, // Normally Tier 2
            maxAttempts: 3,
            trajectory: 'DIVERGENCE', // Divergent jump across structural categories
            auditHistory: [
                {
                    attempt: 1,
                    classification: 'LIGHTING_CURVE_SHIFT',
                    errorTokens: [],
                    timestampMs: 1000,
                },
                {
                    attempt: 2,
                    classification: 'ANATOMICAL_COLLAPSE',
                    errorTokens: ['melted_fingers'],
                    timestampMs: 2000,
                },
            ],
            latestReport: mockReport,
            currentJob: { ...baseJob, attemptCount: 2 },
            ledgerHeadHash: 'hash_head_diverge',
        }

        const directive = engine.evaluateEscalation(context)

        expect(directive.tier).toBe('TIER_3_ARCHITECT_ESCALATION')
        expect(directive.action).toBe('FREEZE_AND_QUARANTINE')
        expect(directive.dossier?.escalationTrigger).toBe(
            'STRUCTURAL_DIVERGENCE',
        )
        expect(directive.dossier?.trajectory).toBe('DIVERGENCE')
        expect(directive.dossier?.clickUpPayload.priority).toBe('URGENT')
        expect(directive.remediatedJob).toBeUndefined() // Zero re-enqueue
    })

    it('Invariant 5: StoryArchitectDossier records cryptographic snapshot and 7-bit ASCII formatting', () => {
        const dossier = buildStoryArchitectDossier(
            'shot-prog-01',
            'sha_plate_987',
            [
                {
                    attempt: 1,
                    classification: 'LIGHTING_CURVE_SHIFT',
                    errorTokens: ['gamma_drop'],
                    timestampMs: 1000,
                },
                {
                    attempt: 2,
                    classification: 'CANON_INVARIANT_BREACH',
                    errorTokens: ['zipper_found'],
                    timestampMs: 2000,
                },
            ],
            'DIVERGENCE',
            'fedcba9876543210',
        )

        expect(dossier.timeline.length).toBe(2)
        expect(dossier.ledgerHashSnapshot).toBe('fedcba9876543210')
        expect(dossier.clickUpPayload.priority).toBe('URGENT')
        expect(dossier.clickUpPayload.tags).toContain('divergence-conflict')
        expect(dossier.contradictionLog).toContain(
            'Structural divergence detected',
        )

        const asciiText = formatDossierForChatOps(dossier)

        // Strict 7-bit ASCII validation
        expect(asciiText).not.toMatch(/[\uD800-\uDFFF]/)
        expect(asciiText).not.toMatch(/[^\x00-\x7F]/)
        expect(asciiText).toContain(
            '>> [ESCALATION:TIER_3] STORY ARCHITECT INTERVENTION REQUIRED',
        )
        expect(asciiText).toContain('STATUS:         EXECUTION FROZEN')
        expect(asciiText).toContain('LEDGER HEAD:    fedcba9876543210')
    })

    it('Invariant 6: Durable Object Terminal Quarantine & Ledger Chaining', async () => {
        const mockCtx = new MockDurableObjectContext()
        const coordinator = new ShotCoordinatorDO(mockCtx as any, {})

        // 1. Enqueue task with maxAttempts: 3
        const enqRes = await coordinator.fetch(
            new Request('https://do.internal/enqueue', {
                method: 'POST',
                body: JSON.stringify({
                    taskId: 'shot-quarantine-01',
                    artistId: 'artist_beta',
                    idempotencyKey: 'idemp_q_01',
                    workflowTemplate: 'wan_t2v.json',
                    maxAttempts: 3,
                }),
            }),
        )
        expect(enqRes.status).toBe(200)

        // 2. Claim lease so task becomes active and watchdog alarm is armed
        const claimRes = await coordinator.fetch(
            new Request('https://do.internal/leases/claim', {
                method: 'POST',
                body: JSON.stringify({ workerId: 'worker_01' }),
            }),
        )
        expect(claimRes.status).toBe(200)
        expect(mockCtx.storage.activeAlarm).not.toBeNull()

        // Simulate task already at attempt 3 (budget exhausted)
        ;(coordinator as any).activeJob.attemptCount = 3

        // 3. Trigger triage-and-remediate with failed plate
        const triageRes = await coordinator.fetch(
            new Request('https://do.internal/tasks/triage-and-remediate', {
                method: 'POST',
                body: JSON.stringify({
                    candidate: {
                        taskId: 'shot-quarantine-01',
                        candidateSha: 'sha256_plate_fail',
                        mimeType: 'image/png',
                        width: 1024,
                        height: 1024,
                        sizeBytes: 2048,
                        perceptualLpipsScore: 0.25,
                    },
                    vlmRawOutput:
                        '<visual_scan_trace>{"eyelineCoordinates": [[0.5, 0.4]], "mouthBoundingBox": {"xMin": 0.45, "yMin": 0.55, "xMax": 0.55, "yMax": 0.65}, "propContourBounds": [], "luminanceDelta": 0.05, "lineSharpnessScore": 0.8, "anachronismsDetected": []}</visual_scan_trace>\n{"classification": "ANATOMICAL_COLLAPSE", "rationale": "Severe anatomical deformation detected."}',
                }),
            }),
        )

        expect(triageRes.status).toBe(200)
        const triageBody = (await triageRes.json()) as any
        expect(triageBody.status).toBe('BLOCKED')
        expect(triageBody.tier).toBe('TIER_3_ARCHITECT_ESCALATION')
        expect(triageBody.dossier).toBeDefined()
        expect(triageBody.dossier.escalationTrigger).toBe(
            'MAX_ATTEMPTS_EXHAUSTED',
        )

        // Inspect ledgerChain
        const ledgerChain = (coordinator as any).ledgerChain
        const quarantineBlock = ledgerChain.find(
            (b: any) => b.eventType === 'TIER_3_QUARANTINED',
        )
        expect(quarantineBlock).toBeDefined()
        expect(quarantineBlock.payload.taskId).toBe('shot-quarantine-01')
        expect(quarantineBlock.payload.trigger).toBe('MAX_ATTEMPTS_EXHAUSTED')

        // Watchdog alarm must be disarmed
        expect(mockCtx.storage.activeAlarm).toBeNull()

        // Active job must be cleared
        expect((coordinator as any).activeJob).toBeNull()
    })

    it('Gauntlet Level 4: Strict Monotonic Progression & Queue Memory Safety', async () => {
        const mockCtx = new MockDurableObjectContext()
        const coordinator = new ShotCoordinatorDO(mockCtx as any, {})

        // Enqueue two separate tasks
        await coordinator.fetch(
            new Request('https://do.internal/enqueue', {
                method: 'POST',
                body: JSON.stringify({
                    taskId: 'task-a',
                    artistId: 'artist_one',
                    idempotencyKey: 'idemp-a',
                    workflowTemplate: 'wan_t2v.json',
                    maxAttempts: 3,
                }),
            }),
        )
        await coordinator.fetch(
            new Request('https://do.internal/enqueue', {
                method: 'POST',
                body: JSON.stringify({
                    taskId: 'task-b',
                    artistId: 'artist_two',
                    idempotencyKey: 'idemp-b',
                    workflowTemplate: 'wan_t2v.json',
                    maxAttempts: 3,
                }),
            }),
        )

        // Claim task-a
        await coordinator.fetch(
            new Request('https://do.internal/leases/claim', {
                method: 'POST',
                body: JSON.stringify({ workerId: 'worker_01' }),
            }),
        )
        expect((coordinator as any).activeJob.taskId).toBe('task-a')
        ;(coordinator as any).activeJob.attemptCount = 3 // Force to tier 3

        // Quarantine task-a
        const triageA = await coordinator.fetch(
            new Request('https://do.internal/tasks/triage-and-remediate', {
                method: 'POST',
                body: JSON.stringify({
                    candidate: {
                        taskId: 'task-a',
                        candidateSha: 'sha256_plate_fail_a',
                        mimeType: 'image/png',
                        width: 1024,
                        height: 1024,
                        sizeBytes: 2048,
                        perceptualLpipsScore: 0.25,
                    },
                    vlmRawOutput:
                        '<visual_scan_trace>{"eyelineCoordinates": [[0.5, 0.4]], "mouthBoundingBox": {"xMin": 0.45, "yMin": 0.55, "xMax": 0.55, "yMax": 0.65}, "propContourBounds": [], "luminanceDelta": 0.05, "lineSharpnessScore": 0.8, "anachronismsDetected": []}</visual_scan_trace>\n{"classification": "LIGHTING_CURVE_SHIFT", "rationale": "Shadows clipped."}',
                }),
            }),
        )
        expect(triageA.status).toBe(200)

        // Memory Safety: activeJob must be cleared, no deadlock
        expect((coordinator as any).activeJob).toBeNull()

        // Claim next task: task-b should be leased without contention
        const claimRes2 = await coordinator.fetch(
            new Request('https://do.internal/leases/claim', {
                method: 'POST',
                body: JSON.stringify({ workerId: 'worker_02' }),
            }),
        )
        expect(claimRes2.status).toBe(200)
        const claimData = (await claimRes2.json()) as any
        expect(claimData.taskId).toBe('task-b')
        expect((coordinator as any).activeJob.taskId).toBe('task-b')
    })
})
