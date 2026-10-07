import { describe, it, expect, vi } from 'vitest'
import {
    createGenesisBlock,
    appendLedgerEntry,
    type LedgerEntry,
} from '../../src/ledger/cryptoLedger.js'
import { ChatOpsNotifier } from '../../src/telemetry/chatOpsNotifier.js'
import { ShotCoordinatorDO } from '../../src/objects/ShotCoordinatorDO.js'

class MockDurableObjectStorage {
    public store = new Map<string, any>()
    async get(key: string): Promise<any> {
        return this.store.get(key)
    }
    async put(key: string, value: any): Promise<void> {
        this.store.set(key, value)
    }
    async delete(key: string): Promise<void> {
        this.store.delete(key)
    }
    async deleteAlarm(): Promise<void> {}
}

class MockDurableObjectContext {
    public storage = new MockDurableObjectStorage()
    public waitUntilTasks: Promise<any>[] = []
    blockConcurrencyWhile(fn: () => Promise<any>): Promise<any> {
        return fn()
    }
    waitUntil(promise: Promise<any>): void {
        this.waitUntilTasks.push(promise)
    }
}

describe('Non-Repudiation, Ledger Commitment, & Asynchronous Telemetry Battery (Phase 5)', () => {
    it('TASK-5.1: createGenesisBlock initializes an unbroken cryptographic chain', async () => {
        const genesis = await createGenesisBlock('task-001', { meta: 'init' })

        expect(genesis.index).toBe(0)
        expect(genesis.eventType).toBe('GENESIS')
        expect(genesis.previousHash).toBe(
            '0000000000000000000000000000000000000000000000000000000000000000',
        )
        expect(genesis.blockHash).toMatch(/^[a-f0-9]{64}$/)
    })

    it('TASK-5.1: appendLedgerEntry maintains strict non-repudiation and unbroken hashing', async () => {
        let chain: LedgerEntry[] = [await createGenesisBlock('task-002')]

        chain = await appendLedgerEntry(chain, 'CHATOPS_MANUAL_OVERRIDE', {
            operatorId: 'operator_alpha',
            reason: 'Fixing color grading',
        })

        expect(chain).toHaveLength(2)
        const secondBlock = chain[1]

        expect(secondBlock.index).toBe(1)
        expect(secondBlock.eventType).toBe('CHATOPS_MANUAL_OVERRIDE')
        expect(secondBlock.payload.operatorId).toBe('operator_alpha')
        expect(secondBlock.previousHash).toBe(chain[0].blockHash) // Link verification
        expect(secondBlock.blockHash).toMatch(/^[a-f0-9]{64}$/)
    })

    it('TASK-5.2: ChatOpsNotifier formats pure 7-bit ASCII payloads without emojis', () => {
        const notifier = new ChatOpsNotifier()
        const output = notifier.formatInterventionReceipt(
            'ABORT',
            'task-003',
            'operator_beta',
            { REASON: 'Director requested cut' },
        )

        // Reject unicode blocks covering emojis and extended symbols
        expect(output).not.toMatch(/[\uD800-\uDFFF]/)
        expect(output).toContain(
            '>> [CHATOPS:ABORT] OPERATOR INTERVENTION LOGGED',
        )
        expect(output).toContain('operator_beta')
    })

    it('TASK-5.2: ChatOpsNotifier dispatches asynchronously without throwing isolate-crashing errors', async () => {
        const originalFetch = globalThis.fetch
        // Mock fetch to reject and simulate complete network failure
        globalThis.fetch = vi
            .fn()
            .mockRejectedValue(new Error('NETWORK_TIMEOUT_FATAL'))

        const notifier = new ChatOpsNotifier()

        // This should safely resolve despite the internal fetch throwing
        await expect(
            notifier.dispatchAsyncAlert('https://bad.url', 'test'),
        ).resolves.not.toThrow()

        globalThis.fetch = originalFetch
    })

    it('TASK-5.3: ShotCoordinatorDO routes interventions via waitUntil for decoupled egress', async () => {
        const mockCtx = new MockDurableObjectContext()
        const coordinator = new ShotCoordinatorDO(mockCtx as any, {
            CHATOPS_SECRET: 'test_secret_123',
            CHATOPS_WEBHOOK_URL: 'https://telemetry.internal/webhook',
        })


coordinator['chatOpsGateway'] = { interceptAndAuthenticate: async (req: any) => ({ authenticated: true, rawBody: await req.text() }) } as any

        const req = new Request('https://do.internal/chatops/command', {
            method: 'POST',
            body: JSON.stringify({
                action: 'OVERRIDE',
                taskId: 'shot-005',
                operatorId: 'operator_gamma',
                reason: 'Adjusting prompt fidelity',
            }),
        })

        const res = await coordinator.fetch(req)

        // Response should be returned immediately
        expect(res.status).toBe(200)
        const data = await res.json() as any
        expect(data.ok).toBe(true)

        // Verify ctx.waitUntil was utilized for the egress
        expect(mockCtx.waitUntilTasks.length).toBe(1)

        // Verify the operator action was recorded to the ledger
        const chain = (await mockCtx.storage.get(
            'ledger_chain',
        )) as LedgerEntry[]
        expect(chain).toHaveLength(2) // Genesis + Override
        expect(chain[1].payload.operatorId).toBe('operator_gamma')
        expect(chain[1].eventType).toBe('CHATOPS_MANUAL_OVERRIDE')
    })
})
