import type Model from './99.core/interface/model.interface'

import LibraryUnit from './00.library.unit/library.unit'
import UnitUnit from './01.unit.unit/unit.unit'
import ActionUnit from './02.action.unit/action.unit'
import DataUnit from './03.data.unit/data.unit'
import ServerUnit from './04.server.unit/server.unit'
import GearsUnit from './05.gears.unit/gears.unit'
import TerminalUnit from './80.terminal.unit/terminal.unit'
import GridUnit from './81.grid.unit/grid.unit'
import ConsoleUnit from './83.console.unit/console.unit'
import InputUnit from './84.input.unit/input.unit'
import ChoiceUnit from './85.choice.unit/choice.unit'
import CollectUnit from './97.collect.unit/collect.unit'
import MenuUnit from './98.menu.unit/menu.unit'
import BusUnit from './99.bus.unit/bus.unit'

import type Library from './00.library.unit/fce/library.interface'
import { LibraryModel } from './00.library.unit/library.model'
import type Unit from './01.unit.unit/fce/unit.interface'
import { UnitModel } from './01.unit.unit/unit.model'
import type Action from './02.action.unit/fce/action.interface'
import { ActionModel } from './02.action.unit/action.model'
import type Data from './03.data.unit/fce/data.interface'
import { DataModel } from './03.data.unit/data.model'
import type Server from './04.server.unit/fce/server.interface'
import { ServerModel } from './04.server.unit/server.model'
import type Gears from './05.gears.unit/fce/gears.interface'
import { GearsModel } from './05.gears.unit/gears.model'
import type Terminal from './80.terminal.unit/fce/terminal.interface'
import { TerminalModel } from './80.terminal.unit/terminal.model'
import type Grid from './81.grid.unit/fce/grid.interface'
import { GridModel } from './81.grid.unit/grid.model'
import type Console from './83.console.unit/fce/console.interface'
import { ConsoleModel } from './83.console.unit/console.model'
import type Input from './84.input.unit/fce/input.interface'
import { InputModel } from './84.input.unit/input.model'
import type Choice from './85.choice.unit/fce/choice.interface'
import { ChoiceModel } from './85.choice.unit/choice.model'
import type Collect from './97.collect.unit/fce/collect.interface'
import { CollectModel } from './97.collect.unit/collect.model'
import type Menu from './98.menu.unit/fce/menu.interface'
import { MenuModel } from './98.menu.unit/menu.model'
import type Bus from './99.bus.unit/fce/bus.interface'
import { BusModel } from './99.bus.unit/bus.model'

export const list: any[] = [
    LibraryUnit,
    UnitUnit,
    ActionUnit,
    DataUnit,
    ServerUnit,
    GearsUnit,
    TerminalUnit,
    GridUnit,
    ConsoleUnit,
    InputUnit,
    ChoiceUnit,
    CollectUnit,
    MenuUnit,
    BusUnit,
]

import * as reduceFromLibrary from './00.library.unit/library.reduce'
import * as reduceFromUnit from './01.unit.unit/unit.reduce'
import * as reduceFromAction from './02.action.unit/action.reduce'
import * as reduceFromData from './03.data.unit/data.reduce'
import * as reduceFromServer from './04.server.unit/server.reduce'
import * as reduceFromGears from './05.gears.unit/gears.reduce'
import * as reduceFromTerminal from './80.terminal.unit/terminal.reduce'
import * as reduceFromGrid from './81.grid.unit/grid.reduce'
import * as reduceFromConsole from './83.console.unit/console.reduce'
import * as reduceFromInput from './84.input.unit/input.reduce'
import * as reduceFromChoice from './85.choice.unit/choice.reduce'
import * as reduceFromCollect from './97.collect.unit/collect.reduce'
import * as reduceFromMenu from './98.menu.unit/menu.reduce'
import * as reduceFromBus from './99.bus.unit/bus.reduce'

export const reducer: any = {
    library: reduceFromLibrary.reducer,
    unit: reduceFromUnit.reducer,
    action: reduceFromAction.reducer,
    data: reduceFromData.reducer,
    server: reduceFromServer.reducer,
    gears: reduceFromGears.reducer,
    terminal: reduceFromTerminal.reducer,
    grid: reduceFromGrid.reducer,
    console: reduceFromConsole.reducer,
    input: reduceFromInput.reducer,
    choice: reduceFromChoice.reducer,
    collect: reduceFromCollect.reducer,
    menu: reduceFromMenu.reducer,
    bus: reduceFromBus.reducer,
}

export default class UnitData implements Model {
    library: Library = new LibraryModel()
    unit: Unit = new UnitModel()
    action: Action = new ActionModel()
    data: Data = new DataModel()
    server: Server = new ServerModel()
    gears: Gears = new GearsModel()
    terminal: Terminal = new TerminalModel()
    grid: Grid = new GridModel()
    console: Console = new ConsoleModel()
    input: Input = new InputModel()
    choice: Choice = new ChoiceModel()
    collect: Collect = new CollectModel()
    menu: Menu = new MenuModel()
    bus: Bus = new BusModel()
}
