import Model from './99.core/interface/model.interface'

import SlackUnit from './00.slack.unit/slack.unit'
import ModelUnit from './01.model.unit/model.unit'
import CollectUnit from './97.collect.unit/collect.unit'
import MenuUnit from './98.menu.unit/menu.unit'
import BusUnit from './99.bus.unit/bus.unit'

import Slack from './00.slack.unit/fce/slack.interface'
import { SlackModel } from './00.slack.unit/slack.model'
import ModelInterface from './01.model.unit/fce/model.interface'
import { ModelModel } from './01.model.unit/model.model'
import Collect from './97.collect.unit/fce/collect.interface'
import { CollectModel } from './97.collect.unit/collect.model'
import Menu from './98.menu.unit/fce/menu.interface'
import { MenuModel } from './98.menu.unit/menu.model'
import Bus from './99.bus.unit/fce/bus.interface'
import { BusModel } from './99.bus.unit/bus.model'

export const list: Array<any> = [
    SlackUnit,
    ModelUnit,
    CollectUnit,
    MenuUnit,
    BusUnit,
]

import * as reduceFromSlack from './00.slack.unit/slack.reduce'
import * as reduceFromModel from './01.model.unit/model.reduce'
import * as reduceFromCollect from './97.collect.unit/collect.reduce'
import * as reduceFromMenu from './98.menu.unit/menu.reduce'
import * as reduceFromBus from './99.bus.unit/bus.reduce'

export const reducer: any = {
    slack: reduceFromSlack.reducer,
    model: reduceFromModel.reducer,
    collect: reduceFromCollect.reducer,
    menu: reduceFromMenu.reducer,
    bus: reduceFromBus.reducer,
}

export default class UnitData implements Model {
    slack: Slack = new SlackModel()
    model: ModelInterface = new ModelModel()
    collect: Collect = new CollectModel()
    menu: Menu = new MenuModel()
    bus: Bus = new BusModel()
}
