import Model from './99.core/interface/model.interface'

import RepobotUnit from './00.repobot.unit/repobot.unit'
import ModelUnit from './01.model.unit/model.unit'
import FirewallUnit from './02.firewall.unit/firewall.unit.js'
import CollectUnit from './97.collect.unit/collect.unit'
import MenuUnit from './98.menu.unit/menu.unit'
import BusUnit from './99.bus.unit/bus.unit'

import Repobot from './00.repobot.unit/fce/repobot.interface'
import { RepobotModel } from './00.repobot.unit/repobot.model'
import ModelInterface from './01.model.unit/fce/model.interface'
import { ModelModel } from './01.model.unit/model.model'
import Firewall from './02.firewall.unit/fce/firewall.interface.js'
import { FirewallModel } from './02.firewall.unit/firewall.model.js'
import Collect from './97.collect.unit/fce/collect.interface'
import { CollectModel } from './97.collect.unit/collect.model'
import Menu from './98.menu.unit/fce/menu.interface'
import { MenuModel } from './98.menu.unit/menu.model'
import Bus from './99.bus.unit/fce/bus.interface'
import { BusModel } from './99.bus.unit/bus.model'

export const list: Array<any> = [
    RepobotUnit,
    ModelUnit,
    FirewallUnit,
    CollectUnit,
    MenuUnit,
    BusUnit,
]

import * as reduceFromRepobot from './00.repobot.unit/repobot.reduce'
import * as reduceFromModel from './01.model.unit/model.reduce'
import { reducer as firewallReducer } from './02.firewall.unit/firewall.reduce.js'
import * as reduceFromCollect from './97.collect.unit/collect.reduce'
import * as reduceFromMenu from './98.menu.unit/menu.reduce'
import * as reduceFromBus from './99.bus.unit/bus.reduce'

export const reducer: any = {
    repobot: reduceFromRepobot.reducer,
    model: reduceFromModel.reducer,
    firewall: firewallReducer,
    collect: reduceFromCollect.reducer,
    menu: reduceFromMenu.reducer,
    bus: reduceFromBus.reducer,
}

export default class UnitData implements Model {
    repobot: Repobot = new RepobotModel()
    model: ModelInterface = new ModelModel()
    firewall: Firewall = new FirewallModel()
    collect: Collect = new CollectModel()
    menu: Menu = new MenuModel()
    bus: Bus = new BusModel()
}
