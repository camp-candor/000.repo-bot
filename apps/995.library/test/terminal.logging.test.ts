import test from 'ava'
import fs from 'fs-extra'
import path from 'path'
import sinon from 'sinon'
import {
    createConsole,
    updateConsole,
} from '../995.library/83.console.unit/buz/console.buzz'
import { ConsoleModel } from '../995.library/83.console.unit/console.model'
import * as COLOR from '../995.library/val/console-color'

test('terminal telemetry -- static sentry asserts zero console.log in run.ts post-init pivot mounting', async (t) => {
    let repoRoot = process.cwd()
    while (
        repoRoot &&
        !(
            fs.existsSync(path.join(repoRoot, 'apps')) &&
            fs.existsSync(path.join(repoRoot, 'packages'))
        )
    ) {
        const parent = path.dirname(repoRoot)
        if (parent === repoRoot) break
        repoRoot = parent
    }

    const runTsPath = path.join(repoRoot, 'apps/995.library/run.ts')
    t.true(fs.existsSync(runTsPath), 'apps/995.library/run.ts must exist')

    const content = await fs.readFile(runTsPath, 'utf8')

    // Find the package mounting section
    const pkgLoopIdx = content.indexOf('for (const pkg of existingPackages)')
    t.true(pkgLoopIdx !== -1, 'Must locate package loop in run.ts')

    const openMenuIdx = content.indexOf('MENU_ACTION_LIBRARY.OPEN_MENU')
    t.true(openMenuIdx !== -1, 'Must locate OPEN_MENU in run.ts')

    const mountingSection = content.slice(pkgLoopIdx, openMenuIdx)

    // Ensure zero console.log or console.error in package mounting loop
    const consoleLogMatches =
        mountingSection.match(/console\.(log|error|warn)\s*\(/g) || []
    t.is(
        consoleLogMatches.length,
        0,
        `Package mounting loop must NOT use raw console.log/error (found: ${consoleLogMatches.join(', ')}). All feedback must route to cns00.`,
    )

    // Ensure UPDATE_CONSOLE is used for mounting telemetry
    t.true(
        mountingSection.includes('UPDATE_CONSOLE'),
        'Package mounting section must route telemetry via UPDATE_CONSOLE',
    )
    t.true(
        mountingSection.includes("idx: 'cns00'"),
        "Telemetry must target console widget idx: 'cns00'",
    )
})

test('terminal telemetry -- cns00 console widget is initialized with green foreground (COLOR.GREEN)', (t) => {
    const model = new ConsoleModel()
    let logOptionsCaptured: any = null

    const mockContrib = {
        log: sinon.fake((opts: any) => {
            logOptionsCaptured = opts
            return {
                log: sinon.fake(),
            }
        }),
    }

    const mockScreen = {
        append: sinon.fake(),
        render: sinon.fake(),
    }

    const ste = {
        value: {
            terminal: {
                contrib: mockContrib,
                screen: mockScreen,
            },
        },
    } as any

    const slv = sinon.fake()
    const bal = {
        idx: 'cns00',
        slv,
    } as any

    createConsole(model, bal, ste)

    t.true(slv.calledOnce, 'Resolver must be invoked')
    const result = slv.firstCall.args[0]

    // Assert that default color is COLOR.GREEN
    t.is(
        result.cnsBit.dat.clr,
        COLOR.GREEN,
        'cns00 color default must be COLOR.GREEN',
    )
    t.is(COLOR.GREEN, 'green', 'COLOR.GREEN constant must equal "green"')

    // Assert widget visual configuration
    t.truthy(
        logOptionsCaptured,
        'contrib.log must have been constructed with options',
    )
    t.is(
        logOptionsCaptured.fg,
        'green',
        'Right-hand column console log foreground (fg) must be green',
    )
    t.is(
        logOptionsCaptured.selectedFg,
        'green',
        'Right-hand column console log selected foreground (selectedFg) must be green',
    )
})

test('terminal telemetry -- updateConsole logs lines directly into cns00 widget rather than stdout', async (t) => {
    const model = new ConsoleModel()
    const loggedLines: string[] = []

    const mockLogWidget = {
        width: 80,
        log: sinon.fake((line: string) => {
            loggedLines.push(line)
        }),
    }

    const huntFake = sinon.fake(async (type: string, bale: any) => {
        if (type === '[Read action] Read Console') {
            return {
                cnsBit: {
                    dat: {
                        idx: bale.idx,
                        bit: mockLogWidget,
                    },
                },
            }
        }
        return {}
    })

    const ste = {
        hunt: huntFake,
        value: {
            terminal: {
                screen: {
                    render: sinon.fake(),
                },
            },
        },
    } as any

    // Spy on stdout to ensure no raw output leaks
    const stdoutSpy = sinon.spy(process.stdout, 'write')

    const slv = sinon.fake()
    const bal = {
        idx: 'cns00',
        src: '>> [OK] Mounted UI Pivot: [100.agent] -> AGENT MENU',
        slv,
    } as any

    try {
        await updateConsole(model, bal, ste)
    } finally {
        stdoutSpy.restore()
    }

    t.true(slv.calledOnce, 'updateConsole must resolve cleanly')
    t.is(
        loggedLines.length,
        1,
        'Exactly one line must be logged to the cns00 widget',
    )
    t.is(
        loggedLines[0],
        '>> [OK] Mounted UI Pivot: [100.agent] -> AGENT MENU',
        'Logged message must match input telemetry',
    )
    t.is(stdoutSpy.callCount, 0, 'No raw output must leak to process.stdout')
})

test('terminal telemetry -- dispatches UI and headless pivot telemetry to cns00 via UPDATE_CONSOLE', async (t) => {
    const dispatchedBales: any[] = []

    const LIBRARY = {
        hunt: sinon.fake(async (action: string, bale: any) => {
            if (action === '[Console action] Update Console') {
                dispatchedBales.push(bale)
            }
            return {}
        }),
    }

    const CONSOLE_ACTION_LIBRARY = {
        UPDATE_CONSOLE: '[Console action] Update Console',
    }

    // Simulate mounting 1 UI pivot, 1 headless pivot, and 1 warning
    await LIBRARY.hunt(CONSOLE_ACTION_LIBRARY.UPDATE_CONSOLE, {
        idx: 'cns00',
        src: '>> [OK] Master Bus Initialized',
    })

    await LIBRARY.hunt(CONSOLE_ACTION_LIBRARY.UPDATE_CONSOLE, {
        idx: 'cns00',
        src: '>> [OK] Mounted UI Pivot: [100.agent] -> AGENT MENU',
    })

    await LIBRARY.hunt(CONSOLE_ACTION_LIBRARY.UPDATE_CONSOLE, {
        idx: 'cns00',
        src: '>> [INFO] Mounted headless pivot: [999.headless] as global.HEADLESS',
    })

    await LIBRARY.hunt(CONSOLE_ACTION_LIBRARY.UPDATE_CONSOLE, {
        idx: 'cns00',
        src: ':: [WARN] Skipping pivot [888.corrupt]: syntax error',
    })

    t.is(
        dispatchedBales.length,
        4,
        'Must dispatch all 4 telemetry events to cns00',
    )

    for (const bale of dispatchedBales) {
        t.is(bale.idx, 'cns00', 'Every telemetry bale must target cns00')
        t.regex(
            bale.src,
            /^[\x00-\x7F]*$/,
            `Telemetry must be pure 7-bit ASCII: ${bale.src}`,
        )
    }

    t.is(dispatchedBales[0].src, '>> [OK] Master Bus Initialized')
    t.is(
        dispatchedBales[1].src,
        '>> [OK] Mounted UI Pivot: [100.agent] -> AGENT MENU',
    )
    t.is(
        dispatchedBales[2].src,
        '>> [INFO] Mounted headless pivot: [999.headless] as global.HEADLESS',
    )
    t.is(
        dispatchedBales[3].src,
        ':: [WARN] Skipping pivot [888.corrupt]: syntax error',
    )
})
