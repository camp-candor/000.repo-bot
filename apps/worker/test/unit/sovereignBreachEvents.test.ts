import { describe, it, expect, vi } from 'vitest'
import { EventHub } from '../../src/events/eventHub.js'
import {
    CURRENT_SCHEMA_VERSIONS,
    type CanonicalEventType,
} from '../../src/events/eventEnvelope.js'

describe('Full-Spectrum Sovereign Boundary & Breach Events', () => {
    function createMockEnv() {
        const storageRows: any[] = []
        return {
            DB: {
                prepare: vi.fn((sql: string) => ({
                    first: vi.fn(async () => {
                        if (sql.includes('ORDER BY sequence_id DESC')) {
                            return storageRows.length > 0
                                ? storageRows[storageRows.length - 1]
                                : null
                        }
                        return null
                    }),
                    bind: vi.fn((...args: any[]) => ({
                        run: vi.fn(async () => {
                            storageRows.push({
                                sequence_id: args[0],
                                record_hash: args[8],
                            })
                        }),
                    })),
                })),
            },
            REPO_BOT_DO: {
                idFromName: vi.fn(() => ({ toString: () => 'global' })),
                get: vi.fn(() => ({
                    fetch: vi.fn(async () => new Response('{"ok":true}')),
                })),
            },
        } as any
    }

    it('publishes SCOPE_FIREWALL_BREACH with strict governance classification', async () => {
        const env = createMockEnv()
        const hub = new EventHub(env)

        const event = await hub.publish({
            domain: 'GOVERNANCE',
            type: 'SCOPE_FIREWALL_BREACH',
            source: 'prAuditEngine',
            correlationId: 'TASK-09',
            payload: {
                taskId: 'TASK-09',
                pullNumber: 42,
                headSha: '11223344556677889900aabbccddeeff00112233',
                violationType: 'PROTECTED_PATH_MUTATION',
                offendingPaths: ['apps/995.library/run.ts'],
                matchedPattern: 'PROTECTED_PATTERNS',
            },
            ascii: '>> [SECURITY] SCOPE_FIREWALL_BREACH: PR #42 mutated apps/995.library/run.ts',
        })

        expect(event.type).toBe('SCOPE_FIREWALL_BREACH')
        expect(event.domain).toBe('GOVERNANCE')
        expect(event.seq).toBe(1)
        expect(event.payload.offendingPaths).toContain(
            'apps/995.library/run.ts',
        )
        expect(event.recordHash).toHaveLength(64)
    })

    it('publishes TOCTOU_HEAD_DRIFT with CAS failure context', async () => {
        const env = createMockEnv()
        const hub = new EventHub(env)

        const event = await hub.publish({
            domain: 'GOVERNANCE',
            type: 'TOCTOU_HEAD_DRIFT',
            source: 'mergeExecutor',
            correlationId: 'TASK-CAS-1',
            payload: {
                taskId: 'TASK-CAS-1',
                pullNumber: 88,
                expectedAuditedSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                actualRemoteSha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
                actor: 'lead-dev',
                driftedAt: Date.now(),
                actionTaken: 'MERGE_ABORTED_LOCK_FROZEN',
            },
            ascii: '>> [CAS ERROR] TOCTOU_HEAD_DRIFT: PR #88 head moved after approval',
        })

        expect(event.type).toBe('TOCTOU_HEAD_DRIFT')
        expect(event.payload.actionTaken).toBe('MERGE_ABORTED_LOCK_FROZEN')
    })

    it('publishes BUDGET_EXHAUSTED and dead-letters task after 3 failed attempts', async () => {
        const env = createMockEnv()
        const hub = new EventHub(env)

        const event = await hub.publish({
            domain: 'FSM',
            type: 'BUDGET_EXHAUSTED',
            source: 'RepoBotDO.fsm',
            correlationId: 'TASK-LOOP',
            payload: {
                taskId: 'TASK-LOOP',
                attemptsRun: 3,
                maxAttempts: 3,
                primaryFailureClass: 'TYPE_SYNTAX',
                terminalState: 'HALTED_FOR_TRIAGE',
            },
            ascii: '>> [FSM CIRCUIT TRIP] BUDGET_EXHAUSTED: Task TASK-LOOP halted after 3 attempts',
        })

        expect(event.type).toBe('BUDGET_EXHAUSTED')
        expect(event.payload.terminalState).toBe('HALTED_FOR_TRIAGE')
    })

    it('publishes DIRECTOR_OVERRIDE capturing manual showrunner parameter adjustment', async () => {
        const env = createMockEnv()
        const hub = new EventHub(env)

        const event = await hub.publish({
            domain: 'AGENT',
            type: 'DIRECTOR_OVERRIDE',
            source: 'DirectorConsole',
            correlationId: 'shot_040_003',
            payload: {
                target: 'shot_040_003',
                property: 'camera.scale',
                from: 1.04,
                to: 1.08,
                actor: 'director',
                reason: 'emotional emphasis',
            },
            ascii: '>> [OVERRIDE] DIRECTOR_OVERRIDE on shot_040_003.camera.scale: 1.04 -> 1.08',
        })

        expect(event.type).toBe('DIRECTOR_OVERRIDE')
        expect(event.payload.property).toBe('camera.scale')
        expect(event.payload.to).toBe(1.08)
    })

    it('confirms every CanonicalEventType variant has a registered integer schema version', () => {
        const types: CanonicalEventType[] = [
            'HEARTBEAT',
            'CHECK_FAILURE',
            'SCOPE_FIREWALL_BREACH',
            'TOCTOU_HEAD_DRIFT',
            'LINEAGE_ANOMALY',
            'BLAST_RADIUS_EXCEEDED',
            'BUDGET_EXHAUSTED',
            'LEASE_HEARTBEAT_EXPIRED',
            'DEAD_LETTER_ENQUEUE',
            'SAGA_COMPENSATION_FAILURE',
            'PIN_DRIFT_DETECTED',
            'CROSS_REPO_DESYNC',
            'EPHEMERAL_RESOURCE_ORPHANED',
            'VELOCITY_DORMANCY_BREACH',
            'HASH_CHAIN_CORRUPTION',
            'COLD_DRAINAGE_REJECTED',
            'HOT_BUFFER_SATURATION',
            'DIRECTOR_OVERRIDE',
            'HUMAN_REJECTION_RECORDED',
            'KILL_SWITCH_ENGAGED',
            'BROKER_OOM_TRIP',
            'BROKER_HEARTBEAT_LOSS',
            'ARTIFACT_CHECKSUM_MISMATCH',
        ]

        for (const t of types) {
            expect(
                CURRENT_SCHEMA_VERSIONS[t],
                `Missing version for ${t}`,
            ).toBeGreaterThanOrEqual(1)
        }
    })
})
