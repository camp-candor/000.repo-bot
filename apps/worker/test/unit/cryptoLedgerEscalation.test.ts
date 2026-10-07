import { describe, it, expect, beforeEach } from 'vitest'
import {
    createGenesisBlock,
    appendLedgerEntry,
    verifyLedgerIntegrity,
    GENESIS_PREVIOUS_HASH,
    type LedgerEntry,
} from '../../src/ledger/cryptoLedger.js'
import {
    verifyEscalationSignature,
    generateEscalationSignature,
    formatPromotionEscalation,
    formatDlqEscalation,
} from '../../src/telemetry/telemetryEscalation.js'
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

describe('Cryptographic Ledger & Telemetry Escalation Battery (Phase 3)', () => {
    let mockCtx: MockDurableObjectContext
    let coordinator: ShotCoordinatorDO

    beforeEach(() => {
        mockCtx = new MockDurableObjectContext()
        coordinator = new ShotCoordinatorDO(mockCtx as any, {
            ESCALATION_SECRET: 'test_secret_123',
            ESCALATION_WEBHOOK_URL: 'https://telemetry.internal/webhook',
        })
    })

    it('TASK-3.1: initializes genesis block with index 0 and 64-char zero previous hash', async () => {
        const genesis = await createGenesisBlock('task-ledger-01', {
            template: 'wan.json',
        })

        expect(genesis.index).toBe(0)
        expect(genesis.previousHash).toBe(GENESIS_PREVIOUS_HASH)
        expect(genesis.blockHash).toMatch(/^[a-f0-9]{64}$/)
        expect(genesis.eventType).toBe('TASK_GENESIS')
        expect(genesis.payload.taskId).toBe('task-ledger-01')
    })

    it('TASK-3.1: appends sequential blocks with unbroken cryptographic hash links', async () => {
        let chain: LedgerEntry[] = [await createGenesisBlock('task-ledger-02')]

        chain = await appendLedgerEntry(chain, 'LEASE_CLAIMED', {
            workerId: 'rig2_gpu',
            epoch: 1,
        })
        chain = await appendLedgerEntry(chain, 'ARTIFACT_PROMOTED', {
            sha256: 'abc123hash',
        })

        expect(chain).toHaveLength(3)
        expect(chain[1].index).toBe(1)
        expect(chain[1].previousHash).toBe(chain[0].blockHash)
        expect(chain[2].index).toBe(2)
        expect(chain[2].previousHash).toBe(chain[1].blockHash)

        const audit = await verifyLedgerIntegrity(chain)
        expect(audit.valid).toBe(true)
    })

    it('TASK-3.1: detects tampering when historical payload or hash pointer is corrupted', async () => {
        let chain: LedgerEntry[] = [await createGenesisBlock('task-ledger-03')]
        chain = await appendLedgerEntry(chain, 'LEASE_CLAIMED', { epoch: 1 })
        chain = await appendLedgerEntry(chain, 'ARTIFACT_PROMOTED', {
            plate: 'out.mp4',
        })

        // Tamper with Block 1 payload
        chain[1].payload.epoch = 999

        const audit = await verifyLedgerIntegrity(chain)
        expect(audit.valid).toBe(false)
        expect(audit.brokenIndex).toBe(1)
        expect(audit.error).toContain('BLOCK_HASH_TAMPERED')
    })

    it('TASK-3.2: verifies timing-safe HMAC-SHA256 signature for inbound telemetry commands', async () => {
        const secret = 'my_super_secure_secret'
        const nowSec = Math.floor(Date.now() / 1000)
        const body = JSON.stringify({ action: 'AUDIT_LEDGER' })

        const validSig = await generateEscalationSignature(body, nowSec, secret)

        const res = await verifyEscalationSignature(
            body,
            validSig,
            nowSec.toString(),
            secret,
        )
        expect(res.valid).toBe(true)

        // Tampered payload fails verification
        const tamperedRes = await verifyEscalationSignature(
            body + 'tamper',
            validSig,
            nowSec.toString(),
            secret,
        )
        expect(tamperedRes.valid).toBe(false)
        expect(tamperedRes.error).toBe('SIGNATURE_MISMATCH')
    })

    it('TASK-3.2: rejects expired signatures exceeding 300-second anti-replay skew window', async () => {
        const secret = 'my_super_secure_secret'
        const expiredSec = Math.floor(Date.now() / 1000) - 350 // 350s ago
        const body = JSON.stringify({ action: 'AUDIT_LEDGER' })

        const sig = await generateEscalationSignature(body, expiredSec, secret)

        const res = await verifyEscalationSignature(
            body,
            sig,
            expiredSec.toString(),
            secret,
        )
        expect(res.valid).toBe(false)
        expect(res.error).toContain('TIMESTAMP_DRIFT_EXPIRED')
    })

    it('TASK-3.2: formats notification templates using strictly 7-bit ASCII characters', () => {
        const promoText = formatPromotionEscalation(
            'task-01',
            2,
            'canonical/shot.mp4',
            'hash123',
        )
        const dlqText = formatDlqEscalation(
            'task-01',
            3,
            'MAX_ATTEMPTS_EXHAUSTED',
        )

        // Check for absence of multi-byte UTF-8 emojis
        expect(promoText).not.toMatch(/[\uD800-\uDFFF]/)
        expect(dlqText).not.toMatch(/[\uD800-\uDFFF]/)
        expect(promoText).toContain(
            '>> [TELEMETRY:ESCALATION] CANONICAL PROMOTION COMMITTED',
        )
        expect(dlqText).toContain(
            '>> [TELEMETRY:ESCALATION] CIRCUIT BREAKER TRIPPED',
        )
    })

    it('TASK-3.3: logs state transitions onto ledger in DO and verifies integrity via RPC', async () => {
        // Enqueue task
        const enqRes = await coordinator.fetch(
            new Request('https://do.internal/enqueue', {
                method: 'POST',
                body: JSON.stringify({ taskId: 'task-e2e-ledger' }),
            }),
        )
        expect(enqRes.status).toBe(200)

        // Claim lease
        await coordinator.fetch(
            new Request('https://do.internal/leases/claim', {
                method: 'POST',
                body: JSON.stringify({ workerId: 'rig2_gpu' }),
            }),
        )

        // Complete task
        await coordinator.fetch(
            new Request('https://do.internal/tasks/complete', {
                method: 'POST',
                body: JSON.stringify({
                    epoch: 1,
                    stagingKey:
                        'staging/renders/task-e2e-ledger/epoch_1_abc.mp4',
                    sha256: 'abc123456789',
                }),
            }),
        )

        // Read ledger chain
        const ledgerRes = await coordinator.fetch(
            new Request('https://do.internal/ledger'),
        )
        const ledgerData = (await ledgerRes.json()) as any
        expect(ledgerData.chain).toHaveLength(3) // Genesis, Claim, Promoted

        // Verify ledger integrity via endpoint
        const verifyRes = await coordinator.fetch(
            new Request('https://do.internal/ledger/verify'),
        )
        const verifyData = (await verifyRes.json()) as any
        expect(verifyData.valid).toBe(true)
    })
})
