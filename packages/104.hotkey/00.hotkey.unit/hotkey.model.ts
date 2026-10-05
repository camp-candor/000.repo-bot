import type Hotkey from './fce/hotkey.interface.js'

export class HotkeyModel implements Hotkey {
    idx = '104.hotkey'
    defaultScript = '000..ahk'
    hotkeyDir = 'data/hotkey'
    lastExecutedScript: string | null = null
}
