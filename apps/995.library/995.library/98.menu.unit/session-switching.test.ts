import test from 'node:test'
import assert from 'node:assert/strict'
import { MenuModel } from './menu.model.js'

test('defensive grid clearing before pivot yield without CLOSE_TERMINAL', async () => {
    const { updateMenu } = await import('./buz/menu.buzz.js')
    const m = new MenuModel() as any
    const calls: string[] = []
    let choiceSrc = 'LIBRARY MENU'
    const ste: any = {
        hunt: async (type: string, bale: any) => {
            calls.push(String(type))
            if (String(type).includes('Update Grid')) return { grdBit: { dat: {} } }
            if (String(type).includes('Open Choice')) return { chcBit: { src: choiceSrc } }
            if (String(type).includes('Library Menu')) {
                if (bale?.slv) bale.slv({ mnuBit: { idx: 'root-menu' } })
                return {}
            }
            return {}
        },
    }
    choiceSrc = 'UNKNOWN-EXIT-XYZ'
    await updateMenu(m, { idx: 't' } as any, ste)
    assert.ok(calls.some((c) => c.includes('Clear Terminal')))
})

test('JUMP_PIVOT transfers in-process with CLEAR_TERMINAL', async () => {
    const { jumpPivot, routeMenu } = await import('./buz/menu.buzz.js')
    const m = new MenuModel() as any
    const ste: any = { hunt: async () => ({ grdBit: { dat: {} } }) }
    await routeMenu(m, { idx: 'x', menuTitle: 'GOBLIN LORE MENU', menuDesc: 'lore', fnc: async (slv?: any) => { if (slv) slv({}) ; return null } } as any, ste)
    const calls: string[] = []
    const ste2: any = {
        hunt: async (type: string, bale: any) => {
            calls.push(String(type))
            if (String(type).includes('Update Grid')) return { grdBit: { dat: {} } }
            if (String(type).includes('Open Choice')) return { chcBit: { src: 'GOBLIN LORE MENU' } }
            if (String(type).includes('Init Menu')) {
                if (bale?.slv) bale.slv({})
                return {}
            }
            return {}
        },
    }
    let done = ''
    await jumpPivot(m, { idx: 'j', targetMenuTitle: 'GOBLIN LORE MENU', slv: () => { done = 'ok' } } as any, ste2)
    assert.equal(done, 'ok')
    assert.ok(calls.some((c) => c.includes('Clear Terminal')))
    assert.ok(!calls.some((c) => c.includes('Close Terminal')))
})

test('headless safety guards resolve immediately', async () => {
    const mod: any = await import('./buz/menu.buzz.js')
    const m = new MenuModel() as any
    for (const fn of [mod.openMenu, mod.updateMenu, mod.routeMenu, mod.jumpPivot]) {
        let r = ''
        await fn(m, { idx: 'h', slv: () => { r = 'resolved' } } as any, undefined as any)
        assert.equal(r, 'resolved')
    }
})
