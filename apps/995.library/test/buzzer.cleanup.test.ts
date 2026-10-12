import test from 'ava'
import sinon from 'sinon'

import { GridModel } from '../995.library/81.grid.unit/grid.model'
import { initGrid, updateGrid } from '../995.library/81.grid.unit/buz/grid.buzz'

import { InputModel } from '../995.library/84.input.unit/input.model'
import {
    initInput,
    updateInput,
    openInput,
} from '../995.library/84.input.unit/buz/input.buzz'

import { ConsoleModel } from '../995.library/83.console.unit/console.model'
import {
    initConsole,
    updateConsole,
    createConsole,
} from '../995.library/83.console.unit/buz/console.buzz'

import { MenuModel } from '../995.library/98.menu.unit/menu.model'
import {
    createMenu,
    routeMenu,
} from '../995.library/98.menu.unit/buz/menu.buzz'

test('81.grid.unit -- initGrid resolves cleanly without debugger stalls', (t) => {
    const model = new GridModel()
    const slv = sinon.fake()
    const bal = { slv } as any

    initGrid(model, bal, null as any)

    t.true(slv.calledOnce, 'initGrid must invoke bal.slv immediately')
    const res = slv.firstCall.args[0]
    t.is(res.grdBit.idx, 'init-grid')
})

test('81.grid.unit -- updateGrid handles undefined dimensions with default 12x12 grid math', (t) => {
    const model = new GridModel()
    const slv = sinon.fake()
    const bal = { slv } as any
    const ste = { value: { terminal: { cols: 12, rows: 12 } } } as any

    updateGrid(model, bal, ste)

    t.true(slv.calledOnce)
    const net = slv.firstCall.args[0].grdBit.dat
    t.is(net.left, '0%')
    t.is(net.top, '0%')
    t.is(net.width, '100%')
    t.is(net.height, '100%')
})

test('84.input.unit -- initInput and updateInput resolve non-blocking stubs', (t) => {
    const model = new InputModel()
    const slvInit = sinon.fake()
    const slvUpd = sinon.fake()

    initInput(model, { slv: slvInit } as any, null as any)
    updateInput(model, { slv: slvUpd } as any, null as any)

    t.true(slvInit.calledOnce)
    t.is(slvInit.firstCall.args[0].putBit.idx, 'init-input')
    t.true(slvUpd.calledOnce)
    t.is(slvUpd.firstCall.args[0].putBit.idx, 'update-input')
})

test('84.input.unit -- openInput handles headless runtime safely', (t) => {
    const model = new InputModel()
    const slv = sinon.fake()
    const bal = { src: 'test-input', slv } as any
    const ste = { value: { terminal: {} } } as any

    openInput(model, bal, ste)

    t.true(slv.calledOnce)
    t.is(slv.firstCall.args[0].putBit.idx, 'open-input-headless')
    t.is(slv.firstCall.args[0].putBit.src, 'test-input')
})

test('83.console.unit -- initConsole resolves bit contract', (t) => {
    const model = new ConsoleModel()
    const slv = sinon.fake()

    initConsole(model, { slv } as any, null as any)

    t.true(slv.calledOnce)
    t.is(slv.firstCall.args[0].cnsBit.idx, 'init-console')
})

test('83.console.unit -- updateConsole handles undefined or empty payload cleanly', async (t) => {
    const model = new ConsoleModel()
    const slv = sinon.fake()
    const mockSte = {
        hunt: sinon.fake.resolves({ cnsBit: { dat: { bit: null } } }),
        value: { terminal: {} },
    } as any

    await updateConsole(model, { slv } as any, mockSte)

    t.true(slv.calledOnce)
    t.is(slv.firstCall.args[0].cnsBit.idx, 'update-console')
})

test('98.menu.unit -- createMenu and routeMenu execute without debugger breaks', (t) => {
    const model = new MenuModel()
    const slvCreate = sinon.fake()
    const slvRoute = sinon.fake()

    createMenu(model, { slv: slvCreate } as any, null as any)
    t.true(slvCreate.calledOnce)
    t.is(slvCreate.firstCall.args[0].mnuBit.idx, 'create-menu')

    routeMenu(
        model,
        { idx: 'TEST_ROUTE', fnc: () => {}, slv: slvRoute } as any,
        null as any,
    )
    t.true(slvRoute.calledOnce)
    t.is(slvRoute.firstCall.args[0].mnuBit.idx, 'route-menu')
    t.true(model.menuRoutes.has('TEST_ROUTE'))
})
