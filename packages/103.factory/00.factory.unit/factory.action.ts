import { Action } from '../99.core/interface/action.interface.js'
import FactoryBit from './fce/factory.bit.js'

// factory actions

export const INIT_FACTORY = '[Factory action] Init Factory'
export class InitFactory implements Action {
    readonly type = INIT_FACTORY
    constructor(public bale: FactoryBit) {}
}

export const UPDATE_FACTORY = '[Factory action] Update Factory'
export class UpdateFactory implements Action {
    readonly type = UPDATE_FACTORY
    constructor(public bale: FactoryBit) {}
}

export const TEST_FACTORY = '[Test action] Test Factory'
export class TestFactory implements Action {
    readonly type = TEST_FACTORY
    constructor(public bale: FactoryBit) {}
}

export const INTELLECT_FACTORY = '[Intellect action] Intellect Factory'
export class IntellectFactory implements Action {
    readonly type = INTELLECT_FACTORY
    constructor(public bale: FactoryBit) {}
}

export const VISION_FACTORY = '[Vision action] Vision Factory'
export class VisionFactory implements Action {
    readonly type = VISION_FACTORY
    constructor(public bale: FactoryBit) {}
}

export const LIST_FACTORY = '[List action] List Factory'
export class ListFactory implements Action {
    readonly type = LIST_FACTORY
    constructor(public bale: FactoryBit) {}
}

export type Actions =
    | InitFactory
    | UpdateFactory
    | TestFactory
    | IntellectFactory
    | VisionFactory
    | ListFactory
