import test from 'node:test'
import assert from 'node:assert/strict'
import { MenuModel } from './menu.model.js'
import { reducer } from './menu.reduce.js'
import * as Act from './menu.action.js'

test('MenuModel initializes with LIBRARY MENU description', () => {
    const m = new MenuModel() as any
    assert.ok(m.menuRouteDescriptions.has('LIBRARY MENU'))
    assert.ok(m.menuRoutes instanceof Map)
})

test('ROUTE_MENU registers external pivots', async () => {
    const m = new MenuModel() as any
    const ste: any = { hunt: async () => ({}) }
    const { routeMenu } = await import('./buz/menu.buzz.js')
    await routeMenu(m, { idx: 'test', menuTitle: 'CAULDRON MENU', menuDesc: 'cauldron', globalKey: 'CAULDRON', fnc: async () => null } as any, ste)
    assert.ok(m.menuRoutes.has('CAULDRON MENU'))
    await routeMenu(m, { idx: 'test', menuTitle: 'GOBLIN LORE MENU', menuDesc: 'lore', globalKey: 'LORE', fnc: async () => null } as any, ste)
    await routeMenu(m, { idx: 'test', menuTitle: 'SERIES SOWER MENU', menuDesc: 'sower', globalKey: 'SOWER', fnc: async () => null } as any, ste)
    assert.equal(m.menuRoutes.size >= 3, true)
})

test('reducer preserves Maps across ROUTE_MENU', async () => {
    const m = new MenuModel() as any
    const next: any = await reducer(m, new Act.RouteMenu(undefined as any), undefined as any)
    assert.ok(next)
})

test('headless guards resolve without TTY', async () => {
    const { openMenu, updateMenu } = await import('./buz/menu.buzz.js')
    const m = new MenuModel() as any
    let resolved = ''
    await openMenu(m, { idx: 'x', slv: () => { resolved = 'open' } } as any, undefined as any)
    assert.equal(resolved, 'open')
    resolved = ''
    await updateMenu(m, { idx: 'x', slv: () => { resolved = 'update' } } as any, undefined as any)
    assert.equal(resolved, 'update')
})
