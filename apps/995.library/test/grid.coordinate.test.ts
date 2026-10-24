import test from 'ava'
import sinon from 'sinon'
import * as Grid from '../995.library/val/grid'
import { GridModel } from '../995.library/81.grid.unit/grid.model'
import { updateGrid } from '../995.library/81.grid.unit/buz/grid.buzz'
import { TerminalModel } from '../995.library/80.terminal.unit/terminal.model'
import { layoutTerminal } from '../995.library/80.terminal.unit/buz/terminal.buzz'

test('81.grid.unit -- Control Axis calculates exact 0-4 columns (33.33% width, 100% height)', (t) => {
    const model = new GridModel()
    const slv = sinon.fake()
    const bal = { ...Grid.CONTROL_AXIS_BIT, slv } as any
    const ste = { value: { terminal: { cols: 12, rows: 12 } } } as any

    updateGrid(model, bal, ste)

    t.true(slv.calledOnce)
    const net = slv.firstCall.args[0].grdBit.dat
    t.is(net.left, '0%')
    t.is(net.top, '0%')
    t.is(net.width, '33.333333333333336%')
    t.is(net.height, '100%')
})

test('81.grid.unit -- Telemetry Axis calculates exact 4-12 columns (66.67% width, 100% height)', (t) => {
    const model = new GridModel()
    const slv = sinon.fake()
    const bal = { ...Grid.TELEMETRY_AXIS_BIT, slv } as any
    const ste = { value: { terminal: { cols: 12, rows: 12 } } } as any

    updateGrid(model, bal, ste)

    t.true(slv.calledOnce)
    const net = slv.firstCall.args[0].grdBit.dat
    t.is(net.left, '33.333333333333336%')
    t.is(net.top, '0%')
    t.is(net.width, '66.66666666666667%')
    t.is(net.height, '100%')
})

test('81.grid.unit -- Status HUD calculates rows 0-3 within Telemetry Axis (25% height)', (t) => {
    const model = new GridModel()
    const slv = sinon.fake()
    const bal = { ...Grid.STATUS_HUD_BIT, slv } as any
    const ste = { value: { terminal: { cols: 12, rows: 12 } } } as any

    updateGrid(model, bal, ste)

    t.true(slv.calledOnce)
    const net = slv.firstCall.args[0].grdBit.dat
    t.is(net.left, '33.333333333333336%')
    t.is(net.top, '0%')
    t.is(net.width, '66.66666666666667%')
    t.is(net.height, '25%')
})

test('81.grid.unit -- Console Log calculates rows 3-12 within Telemetry Axis (75% height)', (t) => {
    const model = new GridModel()
    const slv = sinon.fake()
    const bal = { ...Grid.CONSOLE_LOG_BIT, slv } as any
    const ste = { value: { terminal: { cols: 12, rows: 12 } } } as any

    updateGrid(model, bal, ste)

    t.true(slv.calledOnce)
    const net = slv.firstCall.args[0].grdBit.dat
    t.is(net.left, '33.333333333333336%')
    t.is(net.top, '25%')
    t.is(net.width, '66.66666666666667%')
    t.is(net.height, '75%')
})

test('80.terminal.unit -- layoutTerminal routes core axis indices cleanly', (t) => {
    const model = new TerminalModel()
    const slvControl = sinon.fake()
    const slvTelemetry = sinon.fake()
    const slvHud = sinon.fake()
    const slvConsole = sinon.fake()

    layoutTerminal(model, { src: Grid.CONTROL_AXIS_IDX, slv: slvControl } as any, null as any)
    t.true(slvControl.calledOnce)
    t.deepEqual(slvControl.firstCall.args[0].trmBit.dat, Grid.CONTROL_AXIS_BIT)

    layoutTerminal(model, { src: Grid.TELEMETRY_AXIS_IDX, slv: slvTelemetry } as any, null as any)
    t.true(slvTelemetry.calledOnce)
    t.deepEqual(slvTelemetry.firstCall.args[0].trmBit.dat, Grid.TELEMETRY_AXIS_BIT)

    layoutTerminal(model, { src: Grid.STATUS_HUD_IDX, slv: slvHud } as any, null as any)
    t.true(slvHud.calledOnce)
    t.deepEqual(slvHud.firstCall.args[0].trmBit.dat, Grid.STATUS_HUD_BIT)

    layoutTerminal(model, { src: Grid.CONSOLE_LOG_IDX, slv: slvConsole } as any, null as any)
    t.true(slvConsole.calledOnce)
    t.deepEqual(slvConsole.firstCall.args[0].trmBit.dat, Grid.CONSOLE_LOG_BIT)
})
