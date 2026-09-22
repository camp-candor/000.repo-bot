import type Model from './99.core/interface/model.interface.js'

import JulesUnit from './00.jules.unit/jules.unit.js'
import MenuUnit from './98.menu.unit/menu.unit.js'

import type Jules from './00.jules.unit/fce/jules.interface.js'
import { JulesModel } from './00.jules.unit/jules.model.js'
import type Menu from './98.menu.unit/fce/menu.interface.js'
import { MenuModel } from './98.menu.unit/menu.model.js'

export const list: any[] = [JulesUnit, MenuUnit]

import * as reduceFromJules from './00.jules.unit/jules.reduce.js'
import * as reduceFromMenu from './98.menu.unit/menu.reduce.js'

export const reducer: any = {
    jules: reduceFromJules.reducer,
    menu: reduceFromMenu.reducer,
}

export default class UnitData implements Model {
    jules: Jules = new JulesModel()
    menu: Menu = new MenuModel()
}
