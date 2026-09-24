import { describe, it, expect, vi } from 'vitest'
import { initSlack } from './buz/slack.buzz.js'
import { SlackModel } from './slack.model.js'

describe('slack', () => {
    it('should initialize slack', () => {
        const model = new SlackModel()
        const state = {
            hunt: vi.fn().mockResolvedValue({}),
            dispatch: vi.fn(),
        } as any

        const slv = vi.fn()
        const bal = { idx: 'test', slv } as any

        expect(typeof initSlack).toBe('function')

        const result = initSlack(model, bal, state)
        expect(result).toBe(model)
        expect(slv).toHaveBeenCalledWith({ intBit: { idx: 'init-slack' } })
    })
})
