import Model from './99.core/interface/model.interface'

import GithubUnit from './00.github.unit/github.unit'
import ModelUnit from './01.model.unit/model.unit'
import RepoUnit from './02.repo.unit/repo.unit'
import CollectUnit from './97.collect.unit/collect.unit'
import MenuUnit from './98.menu.unit/menu.unit'
import BusUnit from './99.bus.unit/bus.unit'

import Github from './00.github.unit/fce/github.interface'
import { GithubModel } from './00.github.unit/github.model'
import ModelInterface from './01.model.unit/fce/model.interface'
import { ModelModel } from './01.model.unit/model.model'
import Repo from './02.repo.unit/fce/repo.interface'
import { RepoModel } from './02.repo.unit/repo.model'
import Collect from './97.collect.unit/fce/collect.interface'
import { CollectModel } from './97.collect.unit/collect.model'
import Menu from './98.menu.unit/fce/menu.interface'
import { MenuModel } from './98.menu.unit/menu.model'
import Bus from './99.bus.unit/fce/bus.interface'
import { BusModel } from './99.bus.unit/bus.model'

export const list: Array<any> = [
    GithubUnit,
    ModelUnit,
    RepoUnit,
    CollectUnit,
    MenuUnit,
    BusUnit,
]

import * as reduceFromGithub from './00.github.unit/github.reduce'
import * as reduceFromModel from './01.model.unit/model.reduce'
import * as reduceFromRepo from './02.repo.unit/repo.reduce'
import * as reduceFromCollect from './97.collect.unit/collect.reduce'
import * as reduceFromMenu from './98.menu.unit/menu.reduce'
import * as reduceFromBus from './99.bus.unit/bus.reduce'

export const reducer: any = {
    github: reduceFromGithub.reducer,
    model: reduceFromModel.reducer,
    repo: reduceFromRepo.reducer,
    collect: reduceFromCollect.reducer,
    menu: reduceFromMenu.reducer,
    bus: reduceFromBus.reducer,
}

export default class UnitData implements Model {
    github: Github = new GithubModel()
    model: ModelInterface = new ModelModel()
    repo: Repo = new RepoModel()
    collect: Collect = new CollectModel()
    menu: Menu = new MenuModel()
    bus: Bus = new BusModel()
}
