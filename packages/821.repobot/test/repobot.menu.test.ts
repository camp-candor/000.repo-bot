import { describe, it, expect, vi } from 'vitest'
import { MenuModel } from '../98.menu.unit/menu.model.js'
import * as ActRbt from '../00.repobot.unit/repobot.action.js'
import { initMenu, updateMenu } from '../98.menu.unit/buz/00.menu.buzz.js'

describe('TASK-23.6: Flight Deck HUD Menu & Console Router Integration', () => {
    it('initMenu runs safely headlessly when LIBRARY is absent', async () => {
        delete (globalThis as any).LIBRARY
        delete (global as any).LIBRARY

        const model = new MenuModel()
        const slv = vi.fn()
        const bal = { slv } as any

        const result = await initMenu(model, bal, {} as any)
        expect(result.idx).toBe('98.menu')
        expect(slv).toHaveBeenCalledOnce()
    })

    it('updateMenu presents telemetry connect and disconnect options in Blessed mode', async () => {
        const huntFake = vi.fn((action: string, bale: any) => {
            if (action === '[Grid action] Update Grid') {
                return Promise.resolve({ grdBit: { dat: { left: 0, top: 4 } } })
            }
            if (action === '[Open action] Open Choice') {
                expect(bale.lst).toContain('CONNECT REPOBOT TELEMETRY')
                expect(bale.lst).toContain('DISCONNECT REPOBOT TELEMETRY')
                expect(bale.lst).toContain('INSPECT TELEMETRY STATUS')
                expect(bale.lst).toContain('ROOT MENU')
                return Promise.resolve({ chcBit: { src: 'ROOT MENU' } })
            }
            return Promise.resolve({})
        })

        ;(globalThis as any).LIBRARY = { hunt: huntFake }

        const model = new MenuModel()
        const slv = vi.fn()
        const ste = {
            value: {
                repobot: {
                    connectionState: 'DISCONNECTED',
                    lastSeqReceived: 0,
                },
            },
            hunt: vi.fn().mockResolvedValue({}),
        } as any

        await updateMenu(model, { slv }, ste)
        expect(huntFake).toHaveBeenCalled()
        delete (globalThis as any).LIBRARY
    })

    it('selecting CONNECT REPOBOT TELEMETRY dispatches ActRbt.CONNECT_REPOBOT', async () => {
        const huntFake = vi.fn((action: string) => {
            if (action === '[Grid action] Update Grid') {
                return Promise.resolve({ grdBit: { dat: {} } })
            }
            if (action === '[Open action] Open Choice') {
                return Promise.resolve({
                    chcBit: { src: 'CONNECT REPOBOT TELEMETRY' },
                })
            }
            return Promise.resolve({})
        })

        ;(globalThis as any).LIBRARY = { hunt: huntFake }

        const model = new MenuModel()
        const steHunt = vi.fn().mockResolvedValue({})
        const ste = {
            value: { repobot: { connectionState: 'DISCONNECTED' } },
            hunt: steHunt,
        } as any

        await updateMenu(model, {}, ste)

        expect(steHunt).toHaveBeenCalledWith(ActRbt.CONNECT_REPOBOT, {})
        delete (globalThis as any).LIBRARY
    })
})
