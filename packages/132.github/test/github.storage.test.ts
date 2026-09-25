import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
    checkDrainageStatus,
    countdownDrainage,
    fetchStorageRecords,
    inspectStorageRecord,
} from '../03.storage.unit/buz/storage.buzz.js'
import { StorageModel } from '../03.storage.unit/storage.model.js'

describe('GitHub Terminal Deck: Storage Unit & Forensic Sub-Menu Suite', () => {
    beforeEach(() => {
        vi.restoreAllMocks()
        ;(global as any).LIBRARY = { hunt: vi.fn().mockResolvedValue({}) }
    })

    it('checkDrainageStatus reports sync recency and buffer capacity', async () => {
        const model = new StorageModel()
        const slv = vi.fn()

        global.fetch = vi.fn().mockResolvedValue(
            new Response(
                JSON.stringify({
                    ok: true,
                    lastDrainedAt: Date.now() - 3600000,
                    undrainedCount: 45,
                    totalHotRecords: 120,
                    lastRecord: {
                        sequence_id: 120,
                        repository: 'astro-kahn-it-com/001.goblin-lore',
                        record_hash: '1234567890abcdef1234567890abcdef',
                    },
                    cronSchedule: '0 0 * * * (Midnight UTC)',
                }),
                { status: 200 },
            ),
        ) as any

        await checkDrainageStatus(model, { idx: 'check', slv }, {} as any)
        expect(slv).toHaveBeenCalled()
        const result = slv.mock.calls[0][0]
        expect(result.strBit.val).toBe(1)
        expect(result.strBit.dat.undrainedCount).toBe(45)
    })

    it('countdownDrainage computes hours, minutes, and seconds until 00:00 UTC', async () => {
        const model = new StorageModel()
        const slv = vi.fn()

        await countdownDrainage(model, { idx: 'countdown', slv }, {} as any)
        expect(slv).toHaveBeenCalled()
        const result = slv.mock.calls[0][0]
        expect(result.strBit.val).toBe(1)
        expect(typeof result.strBit.dat.hours).toBe('number')
        expect(typeof result.strBit.dat.minutes).toBe('number')
    })

    it('fetchStorageRecords fetches up to 100 records from D1', async () => {
        const model = new StorageModel()
        const slv = vi.fn()

        const mockRecords = Array.from({ length: 50 }, (_, i) => ({
            sequence_id: i + 1,
            created_at: Date.now(),
            repository: 'astro-kahn-it-com/001.goblin-lore',
            event_type: 'WEBHOOK_RECEIVED',
        }))

        global.fetch = vi.fn().mockResolvedValue(
            new Response(JSON.stringify({ ok: true, events: mockRecords }), {
                status: 200,
            }),
        ) as any

        await fetchStorageRecords(
            model,
            { idx: 'fetch', val: 100, slv },
            {} as any,
        )
        expect(slv).toHaveBeenCalled()
        const result = slv.mock.calls[0][0]
        expect(result.strBit.val).toBe(1)
        expect(result.strBit.lst.length).toBe(50)
    })

    it('inspectStorageRecord displays full forensic card and commit message', async () => {
        const model = new StorageModel()
        const slv = vi.fn()

        const mockRecord = {
            sequence_id: 42,
            created_at: 1727200000000,
            repository: 'astro-kahn-it-com/001.goblin-lore',
            task_id: 'TASK-31862',
            event_type: 'CAS_MERGE',
            actor_id: 'elliotbradly',
            head_sha: 'dab76e8',
            prev_hash: '0000prevhash',
            record_hash: '1111currenthash',
            payload_json: JSON.stringify({
                title: 'chore: bump main package version',
                merged: true,
            }),
            drained_at: 1727203600000,
        }

        await inspectStorageRecord(
            model,
            { idx: 'inspect', dat: mockRecord, slv },
            {} as any,
        )
        expect(slv).toHaveBeenCalled()
        const result = slv.mock.calls[0][0]
        expect(result.strBit.val).toBe(1)
    })

    it('honors (global as any).agentBaseUrl when toggled via agent menu', async () => {
        const model = new StorageModel()
        const slv = vi.fn()
        let targetHostQueried = ''
        ;(global as any).agentBaseUrl = 'http://127.0.0.1:8787'

        global.fetch = vi.fn().mockImplementation(async (url: string) => {
            targetHostQueried = url
            return new Response(JSON.stringify({ ok: true, events: [] }), {
                status: 200,
            })
        }) as any

        await fetchStorageRecords(
            model,
            { idx: 'fetch', val: 10, slv },
            {} as any,
        )
        expect(slv).toHaveBeenCalled()
        expect(targetHostQueried).toMatch(/^http:\/\/127\.0\.0\.1:8787/)

        // Reset
        delete (global as any).agentBaseUrl
    })

    it('checkDrainageStatus absorbs plain-text 404 Not Found without throwing SyntaxError', async () => {
        const model = new StorageModel()
        const slv = vi.fn()

        global.fetch = vi.fn().mockResolvedValue(
            new Response('404 Not Found', {
                status: 404,
                statusText: 'Not Found',
                headers: { 'Content-Type': 'text/plain' },
            }),
        ) as any

        await checkDrainageStatus(model, { idx: 'check', slv }, {} as any)
        expect(slv).toHaveBeenCalled()
        const result = slv.mock.calls[0][0]
        expect(result.strBit.val).toBe(0)
        expect(result.strBit.idx).toBe('check-drainage-status-err')
    })

    it('fetchStorageRecords absorbs plain-text 500 error cleanly without throwing', async () => {
        const model = new StorageModel()
        const slv = vi.fn()

        global.fetch = vi.fn().mockResolvedValue(
            new Response('500 Internal Server Error', {
                status: 500,
                headers: { 'Content-Type': 'text/plain' },
            }),
        ) as any

        await fetchStorageRecords(
            model,
            { idx: 'fetch', val: 10, slv },
            {} as any,
        )
        expect(slv).toHaveBeenCalled()
        const result = slv.mock.calls[0][0]
        expect(result.strBit.val).toBe(0)
        expect(result.strBit.lst).toEqual([])
    })
})
