import { Action } from '../99.core/interface/action.interface.js'
import MenuBit from './fce/menu.bit.js'

export const INIT_MENU = '[Menu action] Init Menu'
export class InitMenu implements Action {
    readonly type = INIT_MENU
    constructor(public bale: MenuBit) {}
}

export const UPDATE_MENU = '[Menu action] Update Menu'
export class UpdateMenu implements Action {
    readonly type = UPDATE_MENU
    constructor(public bale: MenuBit) {}
}

export const TEST_MENU = '[Menu action] Test Menu'
export class TestMenu implements Action {
    readonly type = TEST_MENU
    constructor(public bale: MenuBit) {}
}

export const CLOSE_MENU = '[Menu action] Close Menu'
export class CloseMenu implements Action {
    readonly type = CLOSE_MENU
    constructor(public bale: MenuBit) {}
}

export const LIBRARY_MENU = '[Menu action] Library Menu'
export class LibraryMenu implements Action {
    readonly type = LIBRARY_MENU
    constructor(public bale: MenuBit) {}
}

export const GEMINI_MENU = '[Menu action] Gemini Menu'
export class GeminiMenu implements Action {
    readonly type = GEMINI_MENU
    constructor(public bale: MenuBit) {}
}

export const CLICKUP_MENU = '[Menu action] Clickup Menu'
export class ClickupMenu implements Action {
    readonly type = CLICKUP_MENU
    constructor(public bale: MenuBit) {}
}

export const DATA_MENU = '[Menu action] Data Menu'
export class DataMenu implements Action {
    readonly type = DATA_MENU
    constructor(public bale: MenuBit) {}
}

export const SLACK_MENU = '[Menu action] Slack Menu'
export class SlackMenu implements Action {
    readonly type = SLACK_MENU
    constructor(public bale: MenuBit) {}
}

export const slack_MENU = '[Menu action] slack Menu'
export class slackMenu implements Action {
    readonly type = slack_MENU
    constructor(public bale: MenuBit) {}
}

export const AGENT_MENU = '[Menu action] Agent Menu'
export class AgentMenu implements Action {
    readonly type = AGENT_MENU
    constructor(public bale: MenuBit) {}
}

export const JULES_MENU = '[Menu action] Jules Menu'
export class JulesMenu implements Action {
    readonly type = JULES_MENU
    constructor(public bale: MenuBit) {}
}

export const agent_MENU = '[Menu action] agent Menu'
export class agentMenu implements Action {
    readonly type = agent_MENU
    constructor(public bale: MenuBit) {}
}

export const TELEGRAM_MENU = '[Menu action] Telegram Menu'
export class TelegramMenu implements Action {
    readonly type = TELEGRAM_MENU
    constructor(public bale: MenuBit) {}
}

export const TIME_MENU = '[Menu action] Time Menu'
export class TimeMenu implements Action {
    readonly type = TIME_MENU
    constructor(public bale: MenuBit) {}
}

export const COLOR_MENU = '[Menu action] Color Menu'
export class ColorMenu implements Action {
    readonly type = COLOR_MENU
    constructor(public bale: MenuBit) {}
}

export const FATE_MENU = '[Menu action] Fate Menu'
export class FateMenu implements Action {
    readonly type = FATE_MENU
    constructor(public bale: MenuBit) {}
}

export const BEING_MENU = '[Menu action] Being Menu'
export class BeingMenu implements Action {
    readonly type = BEING_MENU
    constructor(public bale: MenuBit) {}
}

export const UPDATE_FOCUS_PLAY_MENU = '[Focus action] Update Focus Play Menu'
export class UpdateFocusPlayMenu implements Action {
    readonly type = UPDATE_FOCUS_PLAY_MENU
    constructor(public bale: MenuBit) {}
}

export const CREATE_MENU = '[Create action] Create Menu'
export class CreateMenu implements Action {
    readonly type = CREATE_MENU
    constructor(public bale: MenuBit) {}
}

export const HEXMAP_MENU = '[Hexmap action] Hexmap Menu'
export class HexmapMenu implements Action {
    readonly type = HEXMAP_MENU
    constructor(public bale: MenuBit) {}
}

export const CREATE_HEXMAP_MENU = '[Hexmap action] Create Hexmap Menu'
export class CreateHexmapMenu implements Action {
    readonly type = CREATE_HEXMAP_MENU
    constructor(public bale: MenuBit) {}
}

export const RENDER_MENU = '[Render action] Render Menu'
export class RenderMenu implements Action {
    readonly type = RENDER_MENU
    constructor(public bale: MenuBit) {}
}

export const YIELD_MENU = '[Render action] Yield Menu'
export class YieldMenu implements Action {
    readonly type = YIELD_MENU
    constructor(public bale: MenuBit) {}
}

export const PRINT_MENU = '[Render action] Print Menu'
export class PrintMenu implements Action {
    readonly type = PRINT_MENU
    constructor(public bale: MenuBit) {}
}

export const GRAPHICSMAGIC_MENU = '[Menu action] Graphicsmagic Menu'
export class GraphicsmagicMenu implements Action {
    readonly type = GRAPHICSMAGIC_MENU
    constructor(public bale: MenuBit) {}
}

export const TOGGLE_TARGET_MODE = '[Menu action] Toggle Target Mode'
export class ToggleTargetMode implements Action {
    readonly type = TOGGLE_TARGET_MODE
    constructor(public bale?: MenuBit) {}
}

export type Actions =
    | InitMenu
    | ClickupMenu
    | UpdateMenu
    | TestMenu
    | CloseMenu
    | TimeMenu
    | CreateMenu
    | HexmapMenu
    | RenderMenu
    | CreateHexmapMenu
    | YieldMenu
    | ColorMenu
    | UpdateFocusPlayMenu
    | PrintMenu
    | LibraryMenu
    | agentMenu
    | GeminiMenu
    | FateMenu
    | TelegramMenu
    | BeingMenu
    | DataMenu
    | AgentMenu
    | SlackMenu
    | slackMenu
    | JulesMenu
    | GraphicsmagicMenu
    | ToggleTargetMode
