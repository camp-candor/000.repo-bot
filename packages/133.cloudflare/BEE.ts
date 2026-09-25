import Model from './99.core/interface/model.interface'

import CloudflareUnit from './00.cloudflare.unit/cloudflare.unit'
import ProjectUnit from './01.project.unit/project.unit'
import WorkersUnit from './02.workers.unit/workers.unit'
import PagesUnit from './03.pages.unit/pages.unit'
import DeploymentUnit from './04.deployment.unit/deployment.unit'
import CollectUnit from './97.collect.unit/collect.unit'
import MenuUnit from './98.menu.unit/menu.unit'
import BusUnit from './99.bus.unit/bus.unit'

import Cloudflare from './00.cloudflare.unit/fce/cloudflare.interface'
import { CloudflareModel } from './00.cloudflare.unit/cloudflare.model'
import Project from './01.project.unit/fce/project.interface'
import { ProjectModel } from './01.project.unit/project.model'
import Workers from './02.workers.unit/fce/workers.interface'
import { WorkersModel } from './02.workers.unit/workers.model'
import Pages from './03.pages.unit/fce/pages.interface'
import { PagesModel } from './03.pages.unit/pages.model'
import Deployment from './04.deployment.unit/fce/deployment.interface'
import { DeploymentModel } from './04.deployment.unit/deployment.model'
import Collect from './97.collect.unit/fce/collect.interface'
import { CollectModel } from './97.collect.unit/collect.model'
import Menu from './98.menu.unit/fce/menu.interface'
import { MenuModel } from './98.menu.unit/menu.model'
import Bus from './99.bus.unit/fce/bus.interface'
import { BusModel } from './99.bus.unit/bus.model'

export const list: Array<any> = [
    CloudflareUnit,
    ProjectUnit,
    WorkersUnit,
    PagesUnit,
    DeploymentUnit,
    CollectUnit,
    MenuUnit,
    BusUnit,
]

import * as reduceFromCloudflare from './00.cloudflare.unit/cloudflare.reduce'
import * as reduceFromProject from './01.project.unit/project.reduce'
import * as reduceFromWorkers from './02.workers.unit/workers.reduce'
import * as reduceFromPages from './03.pages.unit/pages.reduce'
import * as reduceFromDeployment from './04.deployment.unit/deployment.reduce'
import * as reduceFromCollect from './97.collect.unit/collect.reduce'
import * as reduceFromMenu from './98.menu.unit/menu.reduce'
import * as reduceFromBus from './99.bus.unit/bus.reduce'

export const reducer: any = {
    cloudflare: reduceFromCloudflare.reducer,
    project: reduceFromProject.reducer,
    workers: reduceFromWorkers.reducer,
    pages: reduceFromPages.reducer,
    deployment: reduceFromDeployment.reducer,
    collect: reduceFromCollect.reducer,
    menu: reduceFromMenu.reducer,
    bus: reduceFromBus.reducer,
}

export default class UnitData implements Model {
    cloudflare: Cloudflare = new CloudflareModel()
    project: Project = new ProjectModel()
    workers: Workers = new WorkersModel()
    pages: Pages = new PagesModel()
    deployment: Deployment = new DeploymentModel()
    collect: Collect = new CollectModel()
    menu: Menu = new MenuModel()
    bus: Bus = new BusModel()
}
