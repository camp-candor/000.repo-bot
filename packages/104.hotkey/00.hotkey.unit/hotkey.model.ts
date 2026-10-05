import type Hotkey from './fce/hotkey.interface.js'

export class HotkeyModel implements Hotkey {
    idx = '104.hotkey'
    executionMode = 'STDIN_IN_MEMORY'
    lastExecutedScript: string | null = null
}
