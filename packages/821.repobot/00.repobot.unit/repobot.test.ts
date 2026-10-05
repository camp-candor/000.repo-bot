import { describe, it, expect, vi } from 'vitest'
import {
    initRepobot,
    updateRepobot,
    connectRepobot,
    disconnectRepobot,
} from './buz/repobot.buzz.js'
import { RepobotModel } from './repobot.model.js'

describe('repobot unit', () => {
    it('should initialize repobot', () => {
        const model = new RepobotModel()
        const state = {} as any
        const slv = vi.fn()
        const bal = { idx: 'test', slv } as any

        expect(typeof initRepobot).toBe('function')

        const result = initRepobot(model, bal, state)
        expect(result).toBe(model)
        expect(slv).toHaveBeenCalledWith({ rbtBit: { idx: 'init-repobot', val: 1 } })
    })

    it('should update repobot', () => {
        const model = new RepobotModel()
        const state = {} as any
        const slv = vi.fn()
        const bal = { idx: 'test-update', slv } as any

        const result = updateRepobot(model, bal, state)
        expect(result).toBe(model)
        expect(slv).toHaveBeenCalledWith({ rbtBit: { idx: 'update-repobot', val: 1 } })
    })

    it('should connect repobot', async () => {
        const model = new RepobotModel()
        const state = {} as any
        const slv = vi.fn()
        const bal = { idx: 'connect', slv } as any

        const result = await connectRepobot(model, bal, state)
        expect(result).toBe(model)
        expect(result.connectionState).toBe('CONNECTING')
        expect(slv).toHaveBeenCalledWith({
            rbtBit: { idx: 'connect-repobot', val: 1 },
        })
    })

    it('should disconnect repobot', async () => {
        const model = new RepobotModel()
        const state = {} as any
        const slv = vi.fn()
        const bal = { idx: 'disconnect', slv } as any

        const result = await disconnectRepobot(model, bal, state)
        expect(result).toBe(model)
        expect(result.connectionState).toBe('DISCONNECTED')
        expect(slv).toHaveBeenCalledWith({
            rbtBit: { idx: 'disconnect-repobot', val: 1 },
        })
    })
})
