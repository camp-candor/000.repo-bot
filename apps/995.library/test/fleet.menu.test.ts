import test from 'ava';
import * as ActMnu from '../995.library/98.menu.unit/menu.action';
import { reducer } from '../995.library/98.menu.unit/menu.reduce';
import { MenuModel } from '../995.library/98.menu.unit/menu.model';
import { fleetMenu, sagaTornStateMenu } from '../995.library/98.menu.unit/buz/menu.fleet';

test('Phase 4 Actions: declares FLEET_MENU and SAGA_TORN_STATE_MENU action constants and classes', (t) => {
    t.is(ActMnu.FLEET_MENU, '[Menu action] Fleet Menu');
    t.is(ActMnu.SAGA_TORN_STATE_MENU, '[Menu action] Saga Torn State Menu');

    const fleetAct = new ActMnu.FleetMenu({});
    t.is(fleetAct.type, ActMnu.FLEET_MENU);

    const tornAct = new ActMnu.SagaTornStateMenu({ idx: 'torn' });
    t.is(tornAct.type, ActMnu.SAGA_TORN_STATE_MENU);
});

test('Phase 4 Reducer: reduces FLEET_MENU and SAGA_TORN_STATE_MENU actions cleanly', (t) => {
    const model = new MenuModel();
    const reducedFleet = reducer(model, new ActMnu.FleetMenu({}));
    t.truthy(reducedFleet);

    const reducedTorn = reducer(model, new ActMnu.SagaTornStateMenu({ idx: 'torn' }));
    t.truthy(reducedTorn);
});

test('Phase 4 Headless: fleetMenu and sagaTornStateMenu resolve safely without TTY/Blessed crashes', async (t) => {
    const model = new MenuModel();
    let fleetResolved: any = null;
    let tornResolved: any = null;

    await fleetMenu(
        model,
        {
            idx: 'test-fleet',
            slv: (res: any) => {
                fleetResolved = res;
            },
        },
        null as any,
    );

    t.is(fleetResolved?.mnuBit?.idx, 'fleet-menu-headless');

    await sagaTornStateMenu(
        model,
        {
            idx: 'test-torn',
            dat: {
                sagaId: 'saga-test-01',
                targetsCompleted: ['/targetA'],
                targetsFailed: ['/targetB (EBUSY)'],
            },
            slv: (res: any) => {
                tornResolved = res;
            },
        },
        null as any,
    );

    t.is(tornResolved?.mnuBit?.idx, 'saga-torn-state-menu-headless');
    t.is(tornResolved?.mnuBit?.dat?.sagaId, 'saga-test-01');
});

test('Phase 4 Negative Control: sagaTornStateMenu handles missing or malformed journal payloads safely', async (t) => {
    const model = new MenuModel();
    let tornResolved: any = null;

    // Missing dat payload
    await sagaTornStateMenu(
        model,
        {
            idx: 'test-torn-missing',
            slv: (res: any) => {
                tornResolved = res;
            },
        },
        null as any,
    );

    t.is(tornResolved?.mnuBit?.idx, 'saga-torn-state-menu-headless');
    t.is(tornResolved?.mnuBit?.dat?.sagaId, 'saga-fs-unknown');
    t.deepEqual(tornResolved?.mnuBit?.dat?.targetsCompleted, []);
    t.deepEqual(tornResolved?.mnuBit?.dat?.targetsFailed, ['target/unknown (ERROR)']);

    // Malformed dat payload (empty object)
    tornResolved = null;
    await sagaTornStateMenu(
        model,
        {
            idx: 'test-torn-empty',
            dat: {} as any,
            slv: (res: any) => {
                tornResolved = res;
            },
        },
        null as any,
    );

    t.is(tornResolved?.mnuBit?.idx, 'saga-torn-state-menu-headless');
});


import sinon from 'sinon'
import * as ActLib from '../995.library/00.library.unit/library.action'
import * as ActTrm from '../995.library/80.terminal.unit/terminal.action'
import * as ActGrd from '../995.library/81.grid.unit/grid.action'
import * as ActCns from '../995.library/83.console.unit/console.action'
import * as ActChc from '../995.library/85.choice.unit/choice.action'
import * as ActMnu from '../995.library/98.menu.unit/menu.action'
import { MenuModel } from '../995.library/98.menu.unit/menu.model'
import { libraryMenu } from '../995.library/98.menu.unit/buz/menu.library'

test.serial(
    'libraryMenu -- exposes AUDIT_LIBRARY option and dispatches audit on selection',
    async (t) => {
        const model = new MenuModel()
        const bal = { idx: 'test-menu' } as any

        let capturedChoices: string[] = []
        let auditedActionDispatched = false
        let printMenuDispatched = false

        const mockState: any = {
            hunt: sinon.spy(async (actionType: string, payload: any) => {
                if (actionType === ActTrm.CLEAR_TERMINAL) {
                    return {}
                }
                if (actionType === ActGrd.UPDATE_GRID) {
                    return { grdBit: { dat: { left: 0, top: 4, width: '40%', height: '50%' } } }
                }
                if (actionType === ActCns.UPDATE_CONSOLE) {
                    return {}
                }
                if (actionType === ActChc.OPEN_CHOICE) {
                    capturedChoices = payload.lst || []
                    // Emulate user selecting the audit action
                    return {
                        chcBit: {
                            src: ActLib.AUDIT_LIBRARY.split(']')[1],
                        },
                    }
                }
                if (actionType === ActLib.AUDIT_LIBRARY) {
                    auditedActionDispatched = true
                    return {
                        libBit: {
                            idx: 'audit-library',
                            val: 0,
                            dat: { totalTracked: 1, alignedCount: 1, driftedCount: 0 },
                        },
                    }
                }
                if (actionType === ActMnu.PRINT_MENU) {
                    printMenuDispatched = true
                    return { mnuBit: { idx: 'print-menu' } }
                }
                return {}
            }),
        }

        const auditActionLabel = ActLib.AUDIT_LIBRARY.split(']')[1]

        // Invoke libraryMenu in headless test mode
        await libraryMenu(model, bal, mockState)

        t.true(
            capturedChoices.includes(auditActionLabel),
            `Menu choices must include ${auditActionLabel}`,
        )
        t.true(
            auditedActionDispatched,
            'Selecting the audit choice must dispatch ActLib.AUDIT_LIBRARY',
        )
        t.true(
            printMenuDispatched,
            'Audit result must be dispatched to ActMnu.PRINT_MENU',
        )
    },
)

test.serial(
    'libraryMenu -- passes tooltips through choice callback without thrown errors',
    async (t) => {
        const model = new MenuModel()
        const bal = { idx: 'test-tooltip' } as any

        let callbackDispatchedLines: string[] = []

        const mockState: any = {
            hunt: sinon.spy(async (actionType: string, payload: any) => {
                if (actionType === ActGrd.UPDATE_GRID) {
                    return { grdBit: { dat: {} } }
                }
                if (actionType === ActChc.OPEN_CHOICE) {
                    // Trigger tooltip callback for AUDIT_LIBRARY
                    if (payload?.dat?.cb) {
                        payload.dat.cb(ActLib.AUDIT_LIBRARY.split(']')[1])
                    }
                    return { chcBit: { src: 'ROOT MENU' } }
                }
                if (actionType === ActCns.UPDATE_CONSOLE) {
                    if (payload?.src) callbackDispatchedLines.push(payload.src)
                    return {}
                }
                if (actionType === ActMnu.UPDATE_MENU) {
                    return {}
                }
                return {}
            }),
        }

        await libraryMenu(model, bal, mockState)

        t.true(
            callbackDispatchedLines.some((line) =>
                line.includes('Central Coordination Manifest'),
            ),
            'Tooltip text for AUDIT_LIBRARY must stream to console',
        )
    },
)

test.serial(
    'libraryMenu -- static deduplication invariant: ensures zero duplicate switch branches',
    (t) => {
        const fs = require('fs')
        const path = require('path')

        const candidatePaths = [
            path.resolve(process.cwd(), 'apps/995.library/995.library/98.menu.unit/buz/menu.library.ts'),
            path.resolve(__dirname, '../995.library/98.menu.unit/buz/menu.library.ts'),
        ]
        const filePath = candidatePaths.find((p: string) => fs.existsSync(p))
        t.truthy(filePath, 'menu.library.ts must exist on disk')

        const content = fs.readFileSync(filePath, 'utf8')
        const caseMatches = [...content.matchAll(/case\s+([^:]+):/g)].map((m) => m[1].trim())

        const caseCounts = new Map<string, number>()
        for (const branch of caseMatches) {
            caseCounts.set(branch, (caseCounts.get(branch) || 0) + 1)
        }

        const duplicates = [...caseCounts.entries()].filter(([_, count]) => count > 1)
        t.deepEqual(
            duplicates,
            [],
            `Found duplicate case branch(es) in menu.library.ts: ${JSON.stringify(duplicates)}`,
        )
    },
)

test.serial(
    'defensive teardown -- updateMenu clears terminal before routing to LIBRARY MENU',
    async (t) => {
        const { updateMenu } = require('../995.library/98.menu.unit/buz/menu.buzz.ts')
        const model = new MenuModel()
        const clearedSteps: string[] = []

        const mockState: any = {
            hunt: sinon.spy(async (actionType: string, payload: any) => {
                clearedSteps.push(actionType)
                if (actionType === ActGrd.UPDATE_GRID) {
                    return { grdBit: { dat: {} } }
                }
                if (actionType === ActChc.OPEN_CHOICE) {
                    return { chcBit: { src: 'LIBRARY MENU' } }
                }
                if (actionType === ActTrm.CLEAR_TERMINAL) {
                    return {}
                }
                if (actionType === ActMnu.LIBRARY_MENU) {
                    return { mnuBit: { idx: 'lib' } }
                }
                if (actionType === ActMnu.PRINT_MENU) {
                    return {}
                }
                if (actionType === ActMnu.UPDATE_MENU) {
                    return {}
                }
                return {}
            }),
        }

        // Execute single updateMenu turn (mock timer to not recurse)
        const clock = sinon.useFakeTimers()
        try {
            await updateMenu(model, { idx: 'test-turn' } as any, mockState)

            const clearIndex = clearedSteps.indexOf(ActTrm.CLEAR_TERMINAL)
            const libraryMenuIndex = clearedSteps.indexOf(ActMnu.LIBRARY_MENU)

            t.true(clearIndex !== -1, 'CLEAR_TERMINAL must be dispatched')
            t.true(
                clearIndex < libraryMenuIndex,
                'CLEAR_TERMINAL must be dispatched BEFORE LIBRARY_MENU',
            )
        } finally {
            clock.restore()
        }
    },
)

test.serial(
    'defensive teardown -- libraryMenu clears terminal before returning to ROOT MENU',
    async (t) => {
        const model = new MenuModel()
        const clearedSteps: string[] = []

        const mockState: any = {
            hunt: sinon.spy(async (actionType: string, payload: any) => {
                clearedSteps.push(actionType)
                if (actionType === ActTrm.CLEAR_TERMINAL) {
                    return {}
                }
                if (actionType === ActCns.UPDATE_CONSOLE) {
                    return {}
                }
                if (actionType === ActGrd.UPDATE_GRID) {
                    return { grdBit: { dat: {} } }
                }
                if (actionType === ActChc.OPEN_CHOICE) {
                    return { chcBit: { src: 'ROOT MENU' } }
                }
                if (actionType === ActMnu.UPDATE_MENU) {
                    return {}
                }
                return {}
            }),
        }

        await libraryMenu(model, { idx: 'test-lib' } as any, mockState)

        // Verify CLEAR_TERMINAL occurs before ROOT MENU executes ActMnu.UPDATE_MENU
        const clearCount = clearedSteps.filter((s) => s === ActTrm.CLEAR_TERMINAL).length
        t.true(clearCount >= 2, 'CLEAR_TERMINAL must be called on entry and before ROOT MENU exit')

        const lastClear = clearedSteps.lastIndexOf(ActTrm.CLEAR_TERMINAL)
        const updateMenuIdx = clearedSteps.lastIndexOf(ActMnu.UPDATE_MENU)
        t.true(lastClear < updateMenuIdx, 'Final CLEAR_TERMINAL must precede UPDATE_MENU return')
    },
)

test.serial(
    'libraryMenu -- Progress Library prepends [ALL SIBLINGS] and dispatches PROGRESS_LIBRARY_SAGA on confirmation',
    async (t) => {
        const model = new MenuModel()
        const mockTargets = [
            '[../000.series-dashboard/apps/995.library]',
            '[../000.series-sower-engine/apps/995.library]',
        ]

        let displayedChoices: string[] = []
        let sagaDispatched = false
        let sagaPayload: any = null

        const mockState: any = {
            hunt: sinon.spy(async (actionType: string, payload: any) => {
                if (actionType === ActTrm.CLEAR_TERMINAL) return {}
                if (actionType === ActCns.UPDATE_CONSOLE) return {}
                if (actionType === ActGrd.UPDATE_GRID) {
                    return { grdBit: { dat: {} } }
                }
                if (actionType === ActChc.OPEN_CHOICE) {
                    // First choice modal: select [ALL SIBLINGS (2)]
                    if (payload.lst.some((s: string) => s.startsWith('[ALL SIBLINGS'))) {
                        displayedChoices = payload.lst
                        return { chcBit: { src: payload.lst[0] } }
                    }
                    // Second choice modal (Confirmation): select [YES]
                    if (payload.lst.some((s: string) => s.startsWith('[YES]'))) {
                        return { chcBit: { src: payload.lst[1] } }
                    }
                    // Initial library menu choice: select Progress Library
                    return { chcBit: { src: ActLib.PROGRESS_LIBRARY.split(']')[1] } }
                }
                if (actionType === ActLib.SCAN_LIBRARY) {
                    return { libBit: { lst: mockTargets } }
                }
                if (actionType === ActLib.PROGRESS_LIBRARY_SAGA) {
                    sagaDispatched = true
                    sagaPayload = payload
                    return { libBit: { idx: 'progress-library-saga', val: mockTargets.length } }
                }
                if (actionType === ActMnu.PRINT_MENU) return {}
                return {}
            }),
        }

        await libraryMenu(model, { idx: 'test-progress-batch' } as any, mockState)

        t.true(
            displayedChoices.some((c) => c.startsWith('[ALL SIBLINGS')),
            'Must prepend [ALL SIBLINGS] option to choice list',
        )
        t.true(sagaDispatched, 'Must dispatch PROGRESS_LIBRARY_SAGA when confirmed')
        t.deepEqual(
            sagaPayload?.lst,
            mockTargets,
            'Must pass all discovered targets to PROGRESS_LIBRARY_SAGA',
        )
    },
)

test.serial(
    'libraryMenu -- Progress Library aborts without dispatching saga when operator selects [NO]',
    async (t) => {
        const model = new MenuModel()
        const mockTargets = ['[../000.series-dashboard/apps/995.library]']

        let sagaDispatched = false

        const mockState: any = {
            hunt: sinon.spy(async (actionType: string, payload: any) => {
                if (actionType === ActTrm.CLEAR_TERMINAL) return {}
                if (actionType === ActCns.UPDATE_CONSOLE) return {}
                if (actionType === ActGrd.UPDATE_GRID) return { grdBit: { dat: {} } }
                if (actionType === ActChc.OPEN_CHOICE) {
                    if (payload.lst.some((s: string) => s.startsWith('[ALL SIBLINGS'))) {
                        return { chcBit: { src: payload.lst[0] } }
                    }
                    // Confirm selection: select [NO] CANCEL BATCH SYNC
                    if (payload.lst.some((s: string) => s.startsWith('[NO]'))) {
                        return { chcBit: { src: payload.lst[0] } }
                    }
                    return { chcBit: { src: ActLib.PROGRESS_LIBRARY.split(']')[1] } }
                }
                if (actionType === ActLib.SCAN_LIBRARY) {
                    return { libBit: { lst: mockTargets } }
                }
                if (actionType === ActLib.PROGRESS_LIBRARY_SAGA) {
                    sagaDispatched = true
                    return {}
                }
                if (actionType === ActMnu.PRINT_MENU) return {}
                return {}
            }),
        }

        await libraryMenu(model, { idx: 'test-progress-cancel' } as any, mockState)

        t.false(sagaDispatched, 'Saga must NOT dispatch when operator selects [NO]')
    },
)
