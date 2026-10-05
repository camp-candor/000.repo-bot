import { describe, it, expect, vi } from 'vitest'
import { GeminiModel } from '../00.gemini.unit/gemini.model.js'
import { openGemini } from '../00.gemini.unit/buz/gemini.buzz.js'

describe('openGemini', () => {
    it('resolves with default target URL when no src supplied', async () => {
        const slv = vi.fn()
        const bal = {
            idx: 'test-gemini-default',
            val: 10,
            slv,
        } as any

        const ste = {
            hunt: vi.fn().mockResolvedValue({}),
        } as any

        await openGemini(new GeminiModel(), bal, ste)

        expect(slv).toHaveBeenCalledOnce()
        const res = slv.mock.calls[0][0]
        expect(res.gmnBit).toBeDefined()
        expect(res.gmnBit.src).toBe(
            'https://gemini.google.com/notebook/25fcd56e-a95d-46f8-9b11-c9bace81da4b',
        )
    })

    it('respects custom payload notebookId and delay calibration', async () => {
        const slv = vi.fn()
        const bal = {
            idx: 'test-gemini-override',
            dat: { notebookId: 'custom-notebook-123' },
            val: 10,
            slv,
        } as any

        const ste = {
            hunt: vi.fn().mockResolvedValue({}),
        } as any

        await openGemini(new GeminiModel(), bal, ste)

        expect(slv).toHaveBeenCalledOnce()
        const res = slv.mock.calls[0][0]
        expect(res.gmnBit.src).toBe(
            'https://gemini.google.com/notebook/custom-notebook-123',
        )
    })

    it('falls back gracefully on error without throwing (shell degradation)', async () => {
        const slv = vi.fn()
        const bal = {
            idx: 'test-gemini-error',
            val: 10,
            slv,
        } as any

        const ste = {
            hunt: vi.fn().mockRejectedValue(new Error('Test hunt failure')),
        } as any

        const model = new GeminiModel()
        const result = await openGemini(model, bal, ste)
        expect(result).toBe(model)
        expect(slv).toHaveBeenCalledOnce()
    })
})
