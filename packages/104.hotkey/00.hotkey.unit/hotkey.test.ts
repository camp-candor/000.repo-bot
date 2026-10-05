import { describe, it, expect, vi } from 'vitest'
import { initHotkey } from './buz/hotkey.buzz.js'
import { HotkeyModel } from './hotkey.model.js'

describe('hotkey', () => {
    it('should initialize hotkey', () => {
        const model = new HotkeyModel()
        const state = {
            hunt: vi.fn().mockResolvedValue({}),
            dispatch: vi.fn(),
        } as any

        const slv = vi.fn()
        const bal = { idx: 'test', slv } as any

        // Check if initHotkey is a function and can be called
        expect(typeof initHotkey).toBe('function')

        const result = initHotkey(model, bal, state)
        expect(result).toBe(model)
        //expect(slv).toHaveBeenCalledWith({ intBit: { idx: 'init-hotkey' } });
    })

    it('should wake up the hotkey if url is provided', async () => {
        const model = new HotkeyModel()
        const state = {} as any
        const slv = vi.fn()
        const bal = { idx: 'test', slv } as any

        const urlhotkey = 'https://zero00-hotkey.onrender.com/api/hotkey/test'

        const mockResponsehotkey = { status: 'hotkey-awake' }

        const globalFetch = vi
            .spyOn(global, 'fetch')
            .mockImplementation((url) => {
                if (url === urlhotkey) {
                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve(mockResponsehotkey),
                    } as any)
                }
                return Promise.reject(new Error('Unknown URL'))
            })

        initHotkey(model, bal, state)

        // Wait for the promise in initHotkey to resolve
        await new Promise((resolve) => setTimeout(resolve, 0))

        expect(globalFetch).toHaveBeenCalledWith(urlhotkey)
        expect(slv).toHaveBeenCalledWith({
            intBit: {
                idx: 'init-hotkey',
                dat: {
                    hotkey: mockResponsehotkey,
                },
            },
        })

        globalFetch.mockRestore()
    })

    it('should handle fetch errors', async () => {
        const model = new HotkeyModel()
        const state = {} as any
        const slv = vi.fn()
        const bal = { idx: 'test', slv } as any

        const urlhotkey = 'https://zero00-hotkey.onrender.com/api/hotkey/test'

        const errorMessage = 'Network error'
        const globalFetch = vi
            .spyOn(global, 'fetch')
            .mockImplementation((url) => {
                if (url === urlhotkey) {
                    return Promise.reject(new Error(errorMessage))
                }
                return Promise.resolve({
                    ok: true,
                    json: async () => ({}),
                } as any)
            })

        initHotkey(model, bal, state)

        // Wait for the promise in initHotkey to resolve
        await new Promise((resolve) => setTimeout(resolve, 0))

        expect(globalFetch).toHaveBeenCalledWith(urlhotkey)

        expect(slv).toHaveBeenCalledWith({
            intBit: { idx: 'init-hotkey-err', dat: errorMessage },
        })

        globalFetch.mockRestore()
    })
})
