import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
    initRepobot,
    updateRepobot,
    connectRepobot,
    disconnectRepobot,
} from './buz/repobot.buzz.js'
import { RepobotModel } from './repobot.model.js'

class MockWebSocket {
    public onopen: (() => void) | null = null
    public onmessage: ((event: any) => void) | null = null
    public onclose: ((event: any) => void) | null = null
    public onerror: ((event: any) => void) | null = null
    public closedCode: number | null = null
    public closedReason: string | null = null

    constructor(public url: string) {
        setTimeout(() => {
            if (this.onopen) this.onopen()
        }, 10)
    }

    close(code = 1000, reason = '') {
        this.closedCode = code
        this.closedReason = reason
        if (this.onclose) {
            this.onclose({ code, reason })
        }
    }
}

describe('repobot unit', () => {
    beforeEach(() => {
        ;(globalThis as any).WebSocket = MockWebSocket
    })
    afterEach(() => {
        delete (globalThis as any).WebSocket
    })

    it('should initialize repobot', () => {
        const model = new RepobotModel()
        const state = {} as any
        const slv = vi.fn()
        const bal = { idx: 'test', slv } as any

        expect(typeof initRepobot).toBe('function')

        const result = initRepobot(model, bal, state)
        expect(result).toBe(model)
        expect(slv).toHaveBeenCalledWith({
            rbtBit: { idx: 'init-repobot', val: 1 },
        })
    })

    it('should update repobot', () => {
        const model = new RepobotModel()
        const state = {} as any
        const slv = vi.fn()
        const bal = { idx: 'test-update', slv } as any

        const result = updateRepobot(model, bal, state)
        expect(result).toBe(model)
        expect(slv).toHaveBeenCalledWith({
            rbtBit: { idx: 'update-repobot', val: 1 },
        })
    })

    it('should connect repobot', async () => {
        const model = new RepobotModel()
        const state = {} as any
        const slv = vi.fn()
        const bal = { idx: 'connect', slv } as any

        const result = await connectRepobot(model, bal, state)
        await new Promise((r) => setTimeout(r, 20))
        expect(result).toBe(model)
        expect(result.connectionState).toBe('CONNECTED')
        expect(slv).toHaveBeenCalledWith({
            rbtBit: { idx: 'connect-repobot-success', val: 1 },
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
            rbtBit: { idx: 'disconnect-repobot-success', val: 1 },
        })
    })
})
