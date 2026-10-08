import { describe, it, expect, vi } from 'vitest'
import {
    createGenesisBlock,
    appendLedgerEntry,
    computeBlockHash,
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
    it('INVARIANT 1: Deterministic Genesis & Link Continuity verifies continuous hash links and 64-char hex format', async () => {
        let chain: LedgerEntry[] = [
            await createGenesisBlock('task-genesis-001'),
        ]
        expect(chain[0].index).toBe(0)
        expect(chain[0].eventType).toBe('GENESIS')
        expect(chain[0].previousHash).toBe('0'.repeat(64))
        expect(chain[0].blockHash).toMatch(/^[a-f0-9]{64}$/)

        // Append 3 sequential entries
        chain = await appendLedgerEntry(chain, 'TASK_ENQUEUED', {
            artistId: 'artist_1',
        })
        chain = await appendLedgerEntry(chain, 'LEASE_CLAIMED', {
            workerId: 'gpu_node_1',
        })
        chain = await appendLedgerEntry(chain, 'CHATOPS_MANUAL_OVERRIDE', {
            operatorId: 'operator_alpha',
            reason: 'Color temperature calibration',
        })

        expect(chain).toHaveLength(4)

        for (let i = 1; i < chain.length; i++) {
            expect(chain[i].previousHash).toBe(chain[i - 1].blockHash)
            expect(chain[i].blockHash).toMatch(/^[a-f0-9]{64}$/)
            expect(chain[i].index).toBe(i)
        }
    })

    it('INVARIANT 2: JSON Malleability Defense (Canonicalization) proves key-sorted payload invariance', async () => {
        const entryA = {
            index: 1,
            timestampMs: 1700000000000,
            eventType: 'CANONICAL_TEST',
            payload: { a: 1, b: 2, c: 'value', nested: { z: 9, y: 8 } },
            previousHash: '0'.repeat(64),
        }

        const entryB = {
            index: 1,
            timestampMs: 1700000000000,
            eventType: 'CANONICAL_TEST',
            payload: { nested: { z: 9, y: 8 }, c: 'value', b: 2, a: 1 },
            previousHash: '0'.repeat(64),
        }

        const hashA = await computeBlockHash(entryA)
        const hashB = await computeBlockHash(entryB)

        expect(hashA).toBe(hashB)
        expect(hashA).toMatch(/^[a-f0-9]{64}$/)
    })

    it('INVARIANT 3: Strict Operator Attribution Fencing rejects empty operatorId with HTTP 400 without ledger mutations', async () => {
        const mockCtx = new MockDurableObjectContext()
        const coordinator = new ShotCoordinatorDO(mockCtx as any, {})

        coordinator['chatOpsGateway'] = {
            interceptAndAuthenticate: async (req: any) => ({
                authenticated: true,
                rawBody: await req.text(),
            }),
        } as any

        const req = new Request('https://do.internal/chatops/command', {
            method: 'POST',
            body: JSON.stringify({
                action: 'OVERRIDE',
                taskId: 'shot-fail-anon',
                operatorId: '',
                reason: 'Attempted anonymous intervention',
            }),
        })

        const res = await coordinator.fetch(req)
        expect(res.status).toBe(400)
        const data = (await res.json()) as any
        expect(data.error).toBe('MISSING_TASK_ID_OR_OPERATOR')

        const chain = (await mockCtx.storage.get('ledger_chain')) || []
        expect(chain).toHaveLength(0)
    })

    it('INVARIANT 4: Network Outage Isolation (The Asynchronous Swallow) traps all network exceptions internally', async () => {
        const originalFetch = globalThis.fetch
        globalThis.fetch = vi
            .fn()
            .mockRejectedValue(new Error('NETWORK_TIMEOUT_504_GATEWAY_DOWN'))

        try {
            const notifier = new ChatOpsNotifier()
            await expect(
                notifier.dispatchAsyncAlert(
                    'https://outage.webhook.endpoint',
                    'alert_payload',
                ),
            ).resolves.not.toThrow()
        } finally {
            globalThis.fetch = originalFetch
        }
    })

    it('INVARIANT 5: WaitUntil Single-Turn Egress Decoupling returns HTTP 200 before background webhook fetch completes', async () => {
        const mockCtx = new MockDurableObjectContext()
        const coordinator = new ShotCoordinatorDO(mockCtx as any, {
            CHATOPS_SECRET: 'test_secret_123',
            CHATOPS_WEBHOOK_URL: 'https://telemetry.mock/webhook',
        })

        coordinator['chatOpsGateway'] = {
            interceptAndAuthenticate: async (req: any) => ({
                authenticated: true,
                rawBody: await req.text(),
            }),
        } as any

        let webhookCompleted = false
        const originalFetch = globalThis.fetch
        globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
            if (url.includes('webhook')) {
                await new Promise((resolve) => setTimeout(resolve, 50))
                webhookCompleted = true
                return new Response(JSON.stringify({ ok: true }), {
                    status: 200,
                })
            }
            return new Response(JSON.stringify({ ok: true }), { status: 200 })
        })

        try {
            const req = new Request('https://do.internal/chatops/command', {
                method: 'POST',
                body: JSON.stringify({
                    action: 'OVERRIDE',
                    taskId: 'shot-decoupled-01',
                    operatorId: 'operator_speed',
                    reason: 'Latency sensitive intervention',
                }),
            })

            const res = await coordinator.fetch(req)

            // The DO MUST return HTTP 200 before the background webhook fetch completes
            expect(res.status).toBe(200)
            const data = (await res.json()) as any
            expect(data.ok).toBe(true)
            expect(webhookCompleted).toBe(false)

            // Verify waitUntil task was registered
            expect(mockCtx.waitUntilTasks.length).toBe(1)

            // Await background tasks and confirm completion
            await Promise.all(mockCtx.waitUntilTasks)
            expect(webhookCompleted).toBe(true)

            // Verify ledger recorded the action
            const chain = (await mockCtx.storage.get(
                'ledger_chain',
            )) as LedgerEntry[]
            expect(chain).toBeDefined()
            expect(chain[chain.length - 1].payload.operatorId).toBe(
                'operator_speed',
            )
        } finally {
            globalThis.fetch = originalFetch
        }
    })

    it('INVARIANT 6: Deterministic ASCII Telemetry Compliance formats pure 7-bit ASCII without unicode or emojis', () => {
        const notifier = new ChatOpsNotifier()
        const actions = ['ABORT', 'OVERRIDE', 'RETRY']

        for (const action of actions) {
            const receipt = notifier.formatInterventionReceipt(
                action,
                'task-ascii-001',
                'operator_ascii',
                {
                    REASON: 'Test reason string',
                    EPOCH: 3,
                    STATE: 'PENDING',
                },
            )

            // Assert output starts and ends with code fence
            expect(receipt.startsWith('```text')).toBe(true)
            expect(receipt.endsWith('```')).toBe(true)

            // Assert zero multi-byte characters (pure 7-bit ASCII <= 127)
            for (let i = 0; i < receipt.length; i++) {
                expect(receipt.charCodeAt(i)).toBeLessThanOrEqual(127)
            }

            expect(receipt).toContain(`>> [CHATOPS:${action}]`)
            expect(receipt).toContain('task-ascii-001')
            expect(receipt).toContain('operator_ascii')
        }
    })
})
