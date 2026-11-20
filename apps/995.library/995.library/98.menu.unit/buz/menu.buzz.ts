/* eslint-disable */
import * as ActMnu from '../menu.action'

import * as ActClc from '../../97.collect.unit/collect.action'

import * as ActPut from '../../84.input.unit/input.action'
import * as ActTrm from '../../80.terminal.unit/terminal.action'
import * as ActChc from '../../85.choice.unit/choice.action'

import * as ActGrd from '../../81.grid.unit/grid.action'
import * as ActCns from '../../83.console.unit/console.action'

import * as ActSow from '../../act/sower.action'

import * as ActNj4 from '../../act/neo4j.action'

import type { MenuModel } from '../menu.model'
import type MenuBit from '../fce/menu.bit'
import type State from '../../99.core/state'

import * as Grid from '../../val/grid'
import * as Align from '../../val/align'
import * as Color from '../../val/console-color'

import * as SHAPE from '../../val/shape'
import * as FOCUS from '../../val/focus'

let bit: any, lst: any, dex: any, idx: any, dat: any, src: any
let opened = false

export const initMenu = async (cpy: MenuModel, bal: MenuBit, ste: State) => {
    if (bal == null) bal = { idx: null }

    if (!opened) {
        opened = true
        const path = require('path')
        const fs = require('fs')

        let pkg = { version: '0.0.0' }
        let libPkg = { version: '0.0.0' }

        const libSubPath = path.resolve(
            process.cwd(),
            'apps/995.library/package.json',
        )
        const cwdPkgPath = path.resolve(process.cwd(), 'package.json')
        const rootUpPath = path.resolve(process.cwd(), '../../package.json')

        if (fs.existsSync(libSubPath)) {
            if (fs.existsSync(cwdPkgPath)) pkg = require(cwdPkgPath)
            libPkg = require(libSubPath)
        } else {
            if (fs.existsSync(cwdPkgPath)) libPkg = require(cwdPkgPath)
            if (fs.existsSync(rootUpPath)) pkg = require(rootUpPath)
        }

        bit = await ste.hunt(ActTrm.INIT_TERMINAL, {})
        bit = await ste.hunt(ActTrm.CLEAR_TERMINAL, {})
        bit = await ste.hunt(ActGrd.UPDATE_GRID, {
            x: 4,
            y: 0,
            xSpan: 5,
            ySpan: 12,
        })
        bit = await ste.hunt(ActCns.WRITE_CONSOLE, {
            idx: 'cns00',
            src: '',
            dat: { net: bit.grdBit.dat, src: 'alligaor0' },
        })

        bit = await ste.hunt(ActCns.UPDATE_CONSOLE, {
            idx: 'cns00',
            src: '-----------',
        })
        bit = await ste.hunt(ActCns.UPDATE_CONSOLE, {
            idx: 'cns00',
            src: `REPO-BOT V${pkg.version}`,
        })
        bit = await ste.hunt(ActCns.UPDATE_CONSOLE, {
            idx: 'cns00',
            src: `LIBRARY V${libPkg.version}`,
        })
        bit = await ste.hunt(ActCns.UPDATE_CONSOLE, {
            idx: 'cns00',
            src: '-----------',
        })
    } else {
        bit = await ste.hunt(ActTrm.CLEAR_TERMINAL, {})
    }

    if (bal.slv != null) bal.slv({ mnuBit: { idx: 'init-menu' } })

    return cpy
}

export const openMenu = async (cpy: MenuModel, bal: MenuBit, ste: State) => {
    if (!ste || typeof (ste as any).hunt !== 'function') {
        if ((bal as any)?.slv) (bal as any).slv({ mnuBit: { idx: 'open-menu-headless' } })
        return cpy
    }
    try {
        ;(cpy as any).activeMenuMode = 'ROOT'
        ;(cpy as any).activeSessionTitle = 'MASTER SWITCHBOARD'
    } catch {}
    const FS = require('fs-extra')
    const path = require('path')

    const libSubPath = path.resolve(
        process.cwd(),
        'apps/995.library/package.json',
    )
    const cwdPkgPath = path.resolve(process.cwd(), 'package.json')
    const libPkgPath = FS.existsSync(libSubPath) ? libSubPath : cwdPkgPath
    const pkg = FS.existsSync(libPkgPath)
        ? FS.readJsonSync(libPkgPath)
        : { version: '0.0.0' }
    const version = pkg.version

    bit = await ste.hunt(ActCns.UPDATE_CONSOLE, {
        idx: 'cns00',
        src: '-----------',
    })
    bit = await ste.hunt(ActCns.UPDATE_CONSOLE, {
        idx: 'cns00',
        src: 'LIBRARY V' + version,
    })
    bit = await ste.hunt(ActCns.UPDATE_CONSOLE, {
        idx: 'cns00',
        src: '-----------',
    })
    bit = await ste.hunt(ActCns.UPDATE_CONSOLE, {
        idx: 'cns00',
        src: '>> [READY] Master Library Cockpit Active',
    })
    bit = await ste.hunt(ActCns.UPDATE_CONSOLE, {
        idx: 'cns00',
        src: ':: [KEYS] UP/DOWN or J/K: Navigate | ENTER: Select',
    })

    updateMenu(cpy, bal, ste)
    return cpy
}

export const CONCEPT_MENU = '[Menu action] Concept Menu'
export const INIT_MENU = '[Menu action] Init Menu'

export const updateMenu = async (cpy: MenuModel, bal: MenuBit, ste: State) => {
    try {
        ;(cpy as any).activeMenuMode = 'ROOT'
        ;(cpy as any).activeSessionTitle = 'MASTER SWITCHBOARD'
    } catch {}
    if (!ste || typeof (ste as any).hunt !== 'function') {
        if ((bal as any)?.slv) (bal as any).slv({ mnuBit: { idx: 'update-menu-headless', lst: ['LIBRARY MENU'] } })
        return cpy
    }
    const coreMenus = ['LIBRARY MENU', 'PIVOT MENU', 'SHADE MENU']
    const allRoutes = Array.from(cpy.menuRoutes.keys())
    const siblingRoutes = allRoutes.filter((r) => !coreMenus.includes(r))
    const trailingCoreRoutes = ['PIVOT MENU', 'SHADE MENU'].filter((r) =>
        cpy.menuRoutes.has(r),
    )
    lst = [...siblingRoutes, 'LIBRARY MENU', ...trailingCoreRoutes]
    const descriptions: Record<string, string> = {
        'LIBRARY MENU': 'Open the library menu\nto explore library features.',
    }

    const gridBit = await ste.hunt(ActGrd.UPDATE_GRID, {
        x: 0,
        y: 4,
        xSpan: 4,
        ySpan: 8,
    })
    bit = await ste.hunt(ActChc.OPEN_CHOICE, {
        dat: {
            clr0: Color.BLACK,
            clr1: Color.YELLOW,
            cb: (choice: string) => {
                const text =
                    descriptions[choice] ||
                    cpy.menuRouteDescriptions?.get(choice) ||
                    'No description available.'
                text.split('\n').forEach((srcText: string) =>
                    ste.hunt(ActCns.UPDATE_CONSOLE, {
                        idx: 'cns00',
                        src: srcText,
                    }),
                )
            },
        },
        src: Align.VERTICAL,
        lst,
        net: gridBit.grdBit.dat,
    })

    src = bit?.chcBit?.src

    let shouldReloop = false
    switch (src) {
        case 'LIBRARY MENU': {
            shouldReloop = true
            await yieldToPivotRoute(cpy, 'LIBRARY MENU', ste)
            try {
                ;(cpy as any).activeMenuMode = 'ROOT'
                ;(cpy as any).activeSessionTitle = 'MASTER SWITCHBOARD'
            } catch {}
            try {
                await ste.hunt('[Terminal action] Set Session Context', {
                    activePivotTitle: 'MASTER SWITCHBOARD',
                })
                await ste.hunt(ActCns.UPDATE_CONSOLE, {
                    idx: 'cns00',
                    src: '>> [RETURN] Restored Master Root Switchboard.',
                })
            } catch {}
            break
        }

        default: {
            if (cpy.menuRoutes.has(src)) {
                shouldReloop = true
                await yieldToPivotRoute(cpy, src, ste)
                try {
                    ;(cpy as any).activeMenuMode = 'ROOT'
                    ;(cpy as any).activeSessionTitle = 'MASTER SWITCHBOARD'
                } catch {}
                try {
                    await ste.hunt('[Terminal action] Set Session Context', {
                        activePivotTitle: 'MASTER SWITCHBOARD',
                    })
                    await ste.hunt(ActCns.UPDATE_CONSOLE, {
                        idx: 'cns00',
                        src: '>> [RETURN] Restored Master Root Switchboard.',
                    })
                } catch {}
            } else {
                // Clean teardown on unknown exit or terminal termination
                await ste.hunt(ActTrm.CLEAR_TERMINAL, {})
                bit = await ste.hunt(ActTrm.CLOSE_TERMINAL, {})
                await ste.hunt(ActTrm.CLEAR_TERMINAL, {})
            }
            break
        }
    }

    if (shouldReloop && !bal?.idx?.startsWith('probe-')) {
        const timer = setTimeout(() => {
            updateMenu(cpy, bal, ste)
        }, 333)
        if (timer && typeof timer.unref === 'function') timer.unref()
    }

    return cpy
}

export const testMenu = async (cpy: MenuModel, bal: MenuBit, ste: State) => {
    return cpy
}

export const closeMenu = async (cpy: MenuModel, bal: MenuBit, ste: State) => {
    if (ste?.hunt) {
        await ste.hunt(ActTrm.CLEAR_TERMINAL, {})
        await ste.hunt(ActTrm.CLOSE_TERMINAL, {})
    }
    return cpy
}

export const createMenu = (cpy: MenuModel, bal: MenuBit, _ste: State) => {
    if (bal?.slv != null) bal.slv({ mnuBit: { idx: 'create-menu' } })
    return cpy
}

export const printMenu = async (cpy: MenuModel, bal: MenuBit, ste: State) => {
    dat = bal
    if (dat == null) return bal?.slv ? bal.slv({ mnuBit: { idx: 'print-menu', dat } }) : undefined

    const itm = JSON.stringify(dat)
    lst = itm.split(',')
    lst.forEach((a: string) =>
        ste.hunt(ActCns.UPDATE_CONSOLE, { idx: 'cns00', src: a }),
    )
    ste.hunt(ActCns.UPDATE_CONSOLE, { idx: 'cns00', src: '------------' })

    if (bal?.slv != null) bal.slv({ mnuBit: { idx: 'print-menu', dat: itm } })
}

export const routeMenu = async (cpy: MenuModel, bal: MenuBit, ste?: State) => {
    const payload: any = (bal as any)?.dat && typeof (bal as any).dat === 'object' ? { ...(bal as any).dat, ...(bal as any) } : (bal as any)
    const menuTitle = ((payload?.menuTitle || payload?.src || payload?.idx || '') as string).trim()
    const globalKey = ((payload?.globalKey || '') as string).trim()
    const menuDesc =
        typeof payload?.menuDesc === 'string' && payload.menuDesc.trim().length > 0
            ? payload.menuDesc.trim()
            : typeof payload?.src === 'string' && payload.src.trim().length > 0 && !menuTitle
              ? payload.src.trim()
              : `Launch ${menuTitle || 'domain'} session.`

    // Legacy compatibility: original callers use bal.idx as route key with bal.fnc handler
    const legacyKey = ((bal as any)?.idx || '').trim()
    if (!payload?.menuTitle && legacyKey) {
        ;(cpy as any).menuRoutes.set(legacyKey, (bal as any).fnc as any)
        if ((bal as any).src) (cpy as any).menuRouteDescriptions.set(legacyKey, (bal as any).src)
        if ((bal as any)?.slv != null) (bal as any).slv({ mnuBit: { idx: 'route-menu', val: 1 } })
        return cpy
    }

    if (!menuTitle) {
        if (ste && typeof (ste as any).hunt === 'function') {
            await (ste as any).hunt('[Console action] Update Console', {
                idx: 'cns00',
                src: ':: [WARN] ROUTE_MENU skipped empty menuTitle registration.',
            })
        }
        if ((bal as any)?.slv) (bal as any).slv({ mnuBit: { idx: 'route-menu-invalid' } })
        return cpy
    }

    let routeHandler: any = payload?.fnc || (bal as any)?.fnc

    if (!routeHandler && globalKey) {
        const capturedSte = ste
        routeHandler = async (arg0?: any) => {
            const slv = typeof arg0 === 'function' ? arg0 : undefined
            const g = globalThis as Record<string, any>
            const targetPivot = g[globalKey]
            if (!targetPivot || typeof targetPivot.hunt !== 'function') {
                if (capturedSte && typeof (capturedSte as any).hunt === 'function') {
                    await (capturedSte as any).hunt('[Console action] Update Console', {
                        idx: 'cns00',
                        src: `:: [WARN] Pivot globalThis.${globalKey} is not hydrated.`,
                    })
                }
                if (slv) slv({ mnuBit: { idx: 'pivot-unavailable', src: globalKey } })
                return null
            }
            if (slv) {
                return targetPivot.hunt('[Menu action] Init Menu', { slv })
            }
            return new Promise((resolve) => {
                targetPivot.hunt('[Menu action] Init Menu', { slv: resolve })
            })
        }
    }

    if (routeHandler) {
        ;(cpy as any).menuRoutes.set(menuTitle, routeHandler)
        ;(cpy as any).menuRouteDescriptions.set(menuTitle, menuDesc)
        if (ste && typeof (ste as any).hunt === 'function') {
            try {
                await (ste as any).hunt('[Console action] Update Console', {
                    idx: 'cns00',
                    src: `:: [ROUTE] Mounted [${menuTitle}] -> ${globalKey || 'custom-handler'}`,
                })
            } catch {}
        }
    }

    if ((bal as any)?.slv != null) {
        try {
            ;(bal as any).slv({ mnuBit: { idx: 'route-menu-success', src: menuTitle, val: (cpy as any).menuRoutes.size } })
        } catch {}
    }
    return cpy
}

async function yieldToPivotRoute(cpy: MenuModel, targetTitle: string, ste: any): Promise<void> {
    try {
        ;(cpy as any).activeMenuMode = 'SUBMENU'
        ;(cpy as any).activeSessionTitle = targetTitle
    } catch {}
    await (ste as any).hunt(ActTrm.CLEAR_TERMINAL, {})
    try {
        await (ste as any).hunt('[Console action] Update Console', {
            idx: 'cns00',
            src: `>> [SWITCH] Yielding single-screen session to [${targetTitle}]...`,
        })
    } catch {}
    try {
        await (ste as any).hunt('[Terminal action] Set Session Context', {
            activePivotTitle: targetTitle,
        })
    } catch {}
    if (targetTitle === 'LIBRARY MENU') {
        await new Promise<void>((resolve) => {
            let done = false
            const finish = () => {
                if (!done) {
                    done = true
                    resolve()
                }
            }
            Promise.resolve(
                (ste as any).hunt(ActMnu.LIBRARY_MENU, { slv: finish }),
            ).then(finish, finish)
        })
        return
    }
    const handler = (cpy as any).menuRoutes.get(targetTitle)
    if (handler) {
        await new Promise<void>((resolve) => {
            try {
                const out: any = handler(() => resolve())
                if (out && typeof out.then === 'function') {
                    out.then(() => resolve()).catch(() => resolve())
                }
            } catch {
                resolve()
            }
        })
    } else {
        try {
            await (ste as any).hunt('[Console action] Update Console', {
                idx: 'cns00',
                src: `:: [WARN] Route [${targetTitle}] is not registered in switchboard.`,
            })
        } catch {}
    }
}

export const jumpPivot = async (cpy: MenuModel, bal: MenuBit, ste?: State) => {
    const payload: any = (bal as any)?.dat && typeof (bal as any).dat === 'object' ? { ...(bal as any).dat, ...(bal as any) } : (bal as any)
    const requestedTitle = ((payload?.targetMenuTitle || payload?.menuTitle || payload?.src || '') as string).trim()
    const requestedKey = ((payload?.targetGlobalKey || payload?.globalKey || '') as string).trim()

    if (!ste || typeof (ste as any).hunt !== 'function') {
        if ((bal as any)?.slv) {
            ;(bal as any).slv({ mnuBit: { idx: 'jump-pivot-headless', src: requestedTitle || requestedKey } })
        }
        return cpy
    }

    if (requestedTitle && (requestedTitle === 'LIBRARY MENU' || (cpy as any).menuRoutes.has(requestedTitle))) {
        try {
            await (ste as any).hunt('[Console action] Update Console', {
                idx: 'cns00',
                src: `>> [JUMP] Direct cross-pivot transfer -> [${requestedTitle}]`,
            })
        } catch {}
        await yieldToPivotRoute(cpy, requestedTitle, ste)
        try {
            ;(cpy as any).activeMenuMode = 'ROOT'
            ;(cpy as any).activeSessionTitle = 'MASTER SWITCHBOARD'
        } catch {}
        if ((bal as any)?.slv) {
            ;(bal as any).slv({ mnuBit: { idx: 'jump-pivot-complete', src: requestedTitle } })
        }
        return cpy
    }

    if (requestedKey) {
        const g = globalThis as Record<string, any>
        const targetPivot = g[requestedKey]
        if (targetPivot && typeof targetPivot.hunt === 'function') {
            const label = requestedTitle || `${requestedKey} MENU`
            try {
                ;(cpy as any).activeMenuMode = 'SUBMENU'
                ;(cpy as any).activeSessionTitle = label
            } catch {}
            await (ste as any).hunt(ActTrm.CLEAR_TERMINAL, {})
            try {
                await (ste as any).hunt('[Console action] Update Console', {
                    idx: 'cns00',
                    src: `>> [JUMP] Direct globalThis.${requestedKey} transfer -> [${label}]`,
                })
            } catch {}
            await new Promise<void>((resolve) => {
                try {
                    targetPivot.hunt('[Menu action] Init Menu', { slv: () => resolve() })
                } catch {
                    resolve()
                }
            })
            try {
                ;(cpy as any).activeMenuMode = 'ROOT'
                ;(cpy as any).activeSessionTitle = 'MASTER SWITCHBOARD'
            } catch {}
            if ((bal as any)?.slv) {
                ;(bal as any).slv({ mnuBit: { idx: 'jump-pivot-complete', src: label } })
            }
            return cpy
        }
    }

    try {
        await (ste as any).hunt('[Console action] Update Console', {
            idx: 'cns00',
            src: `:: [WARN] JUMP_PIVOT target unavailable (${requestedTitle || requestedKey || 'empty'}).`,
        })
    } catch {}
    if ((bal as any)?.slv) {
        ;(bal as any).slv({ mnuBit: { idx: 'jump-pivot-missing', src: requestedTitle || requestedKey } })
    }
    return cpy
}
