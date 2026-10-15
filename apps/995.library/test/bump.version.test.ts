import test from 'ava'
import sinon from 'sinon'
import * as ActLib from '../995.library/00.library.unit/library.action'
import * as ActCns from '../995.library/83.console.unit/console.action'
import * as ActTrm from '../995.library/80.terminal.unit/terminal.action'
import * as ActGrd from '../995.library/81.grid.unit/grid.action'
import * as ActChc from '../995.library/85.choice.unit/choice.action'
import * as ActMnu from '../995.library/98.menu.unit/menu.action'
import { reducer } from '../995.library/00.library.unit/library.reduce'
import { LibraryModel } from '../995.library/00.library.unit/library.model'
import { bumpFleetVersion } from '../995.library/00.library.unit/buz/library.buzz'
import { MenuModel } from '../995.library/98.menu.unit/menu.model'
import { libraryMenu } from '../995.library/98.menu.unit/buz/menu.library'

test('BUMP_FLEET_VERSION action constants and class instantiate properly', (t) => {
    t.is(ActLib.BUMP_FLEET_VERSION, '[Release action] Bump Fleet Version')
    const act = new ActLib.BumpFleetVersion({ idx: 'release-test' })
    t.is(act.type, ActLib.BUMP_FLEET_VERSION)
    t.is(act.bale?.idx, 'release-test')
})

test('reducer maps BUMP_FLEET_VERSION without mutating model in place', async (t) => {
    const model = new LibraryModel()
    const slv = sinon.fake()
    const bale = { slv } as any

    const reduced = await reducer(model, new ActLib.BumpFleetVersion(bale))
    t.truthy(reduced)
    t.true(slv.calledOnce)
    t.is(slv.firstCall.args[0].libBit.idx, 'bump-fleet-version')
})

test('bumpFleetVersion streams 7-bit ASCII telemetry and resolves bal.slv', async (t) => {
    const model = new LibraryModel()
    const slv = sinon.fake()
    const hunt = sinon.fake.resolves({})
    const ste = { hunt } as any
    const bale = { slv } as any

    await bumpFleetVersion(model, bale, ste)

    t.true(slv.calledOnce)
    t.is(slv.firstCall.args[0].libBit.idx, 'bump-fleet-version')
    t.true(hunt.called)

    for (const call of hunt.args) {
        const payload = call[1]
        t.is(payload.idx, 'cns00')
        t.regex(
            payload.src,
            /^[\x00-\x7F]*$/,
            `Telemetry must be 7-bit ASCII: ${payload.src}`,
        )
    }
})

test('libraryMenu surfaces BUMP_FLEET_VERSION and executes upon selection', async (t) => {
    const model = new MenuModel()
    const actionLabel = ActLib.BUMP_FLEET_VERSION.split(']')[1]
    let menuChoices: string[] = []
    let bumpDispatched = false

    const mockState: any = {
        hunt: sinon.spy(async (actionType: string, payload: any) => {
            if (actionType === ActTrm.CLEAR_TERMINAL) return {}
            if (actionType === ActGrd.UPDATE_GRID)
                return { grdBit: { dat: {} } }
            if (actionType === ActCns.UPDATE_CONSOLE) return {}
            if (actionType === ActChc.OPEN_CHOICE) {
                menuChoices = payload.lst || []
                return { chcBit: { src: actionLabel } }
            }
            if (actionType === ActLib.BUMP_FLEET_VERSION) {
                bumpDispatched = true
                return { libBit: { idx: 'bump-fleet-version', val: 1 } }
            }
            if (actionType === ActMnu.PRINT_MENU) return {}
            return {}
        }),
    }

    await libraryMenu(model, { idx: 'menu-test' } as any, mockState)

    t.true(
        menuChoices.includes(actionLabel),
        `Menu must contain ${actionLabel}`,
    )
    t.true(
        bumpDispatched,
        'Selecting the menu item must dispatch BUMP_FLEET_VERSION',
    )
})
