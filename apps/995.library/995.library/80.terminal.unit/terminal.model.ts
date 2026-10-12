import type Terminal from './fce/terminal.interface'
import TerminalBit from './fce/terminal.interface'

let _blessed: any = null
let _contrib: any = null
let _screen: any = null

export class TerminalModel implements Terminal {
    idx = '998.terminal'
    term: any

    rootIDX: any
    rootDAT: any

    get blessed(): any {
        return _blessed
    }
    set blessed(val: any) {
        _blessed = val
    }

    get contrib(): any {
        return _contrib
    }
    set contrib(val: any) {
        _contrib = val
    }

    get screen(): any {
        return _screen
    }
    set screen(val: any) {
        _screen = val
    }

    cols = 12
    rows = 12
}
