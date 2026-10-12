import test from 'ava'
import * as ActTrm from '../995.library/80.terminal.unit/terminal.action'
import * as ActGrd from '../995.library/81.grid.unit/grid.action'
import * as ActCns from '../995.library/83.console.unit/console.action'
import * as ActChc from '../995.library/85.choice.unit/choice.action'
import * as ActPut from '../995.library/84.input.unit/input.action'
import * as ActLib from '../995.library/00.library.unit/library.action'
import * as ActUnt from '../995.library/01.unit.unit/unit.action'
import * as ActMnu from '../995.library/98.menu.unit/menu.action'

import { reducer as terminalReducer } from '../995.library/80.terminal.unit/terminal.reduce'
import { TerminalModel } from '../995.library/80.terminal.unit/terminal.model'

import { reducer as gridReducer } from '../995.library/81.grid.unit/grid.reduce'
import { GridModel } from '../995.library/81.grid.unit/grid.model'

import { reducer as choiceReducer } from '../995.library/85.choice.unit/choice.reduce'
import { ChoiceModel } from '../995.library/85.choice.unit/choice.model'

import { reducer as inputReducer } from '../995.library/84.input.unit/input.reduce'
import { InputModel } from '../995.library/84.input.unit/input.model'

import { reducer as libraryReducer } from '../995.library/00.library.unit/library.reduce'
import { LibraryModel } from '../995.library/00.library.unit/library.model'

import { reducer as unitReducer } from '../995.library/01.unit.unit/unit.reduce'
import { UnitModel } from '../995.library/01.unit.unit/unit.model'

import { reducer as menuReducer } from '../995.library/98.menu.unit/menu.reduce'
import { MenuModel } from '../995.library/98.menu.unit/menu.model'

test('Action classes satisfy generic Action<T> and preserve type constants', (t) => {
    const initTrm = new ActTrm.InitTerminal({ idx: 'trm' })
    t.is(initTrm.type, '[Terminal action] Init Terminal')
    t.is(initTrm.bale.idx, 'trm')

    const updateGrd = new ActGrd.UpdateGrid({
        idx: 'grd',
        x: 0,
        y: 0,
        xSpan: 4,
        ySpan: 4,
    })
    t.is(updateGrd.type, '[Grid action] Update Grid')
    t.is(updateGrd.bale.xSpan, 4)

    const updateCns = new ActCns.UpdateConsole({
        idx: 'cns00',
        src: 'telemetry',
    })
    t.is(updateCns.type, '[Console action] Update Console')
    t.is(updateCns.bale.src, 'telemetry')

    const openChc = new ActChc.OpenChoice({ idx: 'chc', lst: ['A', 'B'] })
    t.is(openChc.type, '[Open action] Open Choice')
    t.deepEqual(openChc.bale.lst, ['A', 'B'])

    const openPut = new ActPut.OpenInput({ idx: 'put', txt: 'label' })
    t.is(openPut.type, '[Open action] Open Input')
    t.is(openPut.bale.txt, 'label')

    const auditLib = new ActLib.AuditLibrary()
    t.is(auditLib.type, '[Audit action] Audit Library')

    const createUnt = new ActUnt.CreateUnit({ idx: '00.demo.unit' })
    t.is(createUnt.type, '[Create action] Create Unit')
    t.is(createUnt.bale.idx, '00.demo.unit')

    const routeMnu = new ActMnu.RouteMenu(undefined)
    t.is(routeMnu.type, '[Route action] Route Menu')
})

test('Reducers fold actions immutably and maintain distinct instance references', (t) => {
    const trmModel = new TerminalModel()
    const trmNext = terminalReducer(
        trmModel,
        new ActTrm.CloseTerminal({ idx: 'trm' }),
    )
    t.truthy(trmNext)
    t.not(trmNext, trmModel)

    const grdModel = new GridModel()
    const grdNext = gridReducer(grdModel, new ActGrd.InitGrid({ idx: 'grd' }))
    t.truthy(grdNext)
    t.not(grdNext, grdModel)

    const chcModel = new ChoiceModel()
    const chcNext = choiceReducer(
        chcModel,
        new ActChc.InitChoice({ idx: 'chc' }),
    )
    t.truthy(chcNext)
    t.not(chcNext, chcModel)

    const putModel = new InputModel()
    const putNext = inputReducer(putModel, new ActPut.InitInput({ idx: 'put' }))
    t.truthy(putNext)
    t.not(putNext, putModel)

    const libModel = new LibraryModel()
    const libNext = libraryReducer(libModel, new ActLib.ScanLibrary({}))
    t.truthy(libNext)
    t.not(libNext, libModel)

    const untModel = new UnitModel()
    const untNext = unitReducer(untModel, new ActUnt.InitUnit({ idx: 'unt' }))
    t.truthy(untNext)
    t.not(untNext, untModel)

    const mnuModel = new MenuModel()
    const mnuNext = menuReducer(mnuModel, new ActMnu.CloseMenu({ idx: 'mnu' }))
    t.truthy(mnuNext)
    t.not(mnuNext, mnuModel)
})
