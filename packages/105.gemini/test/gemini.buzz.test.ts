import { test, expect, vi } from 'vitest'

vi.mock('node:child_process', () => {
    return {
        exec: vi.fn((cmd, cb) => {
            if (typeof cb === 'function') cb(null, { stdout: '', stderr: '' })
            return {} as any
        }),
    }
})

import { GeminiModel } from '../00.gemini.unit/gemini.model.js'
import { openGemini } from '../00.gemini.unit/buz/gemini.buzz.js'

test('openGemini resolves with target URL payload', async () => {
    const slv = vi.fn()
    const bal = {
        idx: 'test-gemini',
        src: 'https://gemini.google.com/notebook/25fcd56e-a95d-46f8-9b11-c9bace81da4b',
        val: 1,
        slv,
    } as any

    const ste = {
        hunt: vi.fn().mockResolvedValue({}),
    } as any

    await openGemini(new GeminiModel(), bal, ste)

    expect(slv).toHaveBeenCalledOnce()
    const response = slv.mock.calls[0][0]
    expect(response.gmnBit).toBeTruthy()
    expect(response.gmnBit.src).toBe(
        'https://gemini.google.com/notebook/25fcd56e-a95d-46f8-9b11-c9bace81da4b',
    )
})
