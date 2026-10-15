import test from 'ava'
import sinon from 'sinon'
import { TerminalModel } from '../995.library/80.terminal.unit/terminal.model'
import * as ActTrm from '../995.library/80.terminal.unit/terminal.action'
import { reducer } from '../995.library/80.terminal.unit/terminal.reduce'
import {
    suspendTerminal,
    resumeTerminal,
    editTerminal,
} from '../995.library/80.terminal.unit/buz/terminal.buzz'

test('Phase 1 Arbitration -- Action types and classes implement Action<TerminalBit>', (t) => {
    t.is(ActTrm.SUSPEND_TERMINAL, '[Suspend action] Suspend Terminal')
    t.is(ActTrm.RESUME_TERMINAL, '[Resume action] Resume Terminal')
    t.is(ActTrm.EDIT_TERMINAL, '[Edit action] Edit Terminal')

    const suspendAct = new ActTrm.SuspendTerminal({ idx: 'test-suspend' })
    const resumeAct = new ActTrm.ResumeTerminal({ idx: 'test-resume' })
    const editAct = new ActTrm.EditTerminal({ idx: 'test-edit' })

    t.is(suspendAct.type, ActTrm.SUSPEND_TERMINAL)
    t.is(resumeAct.type, ActTrm.RESUME_TERMINAL)
    t.is(editAct.type, ActTrm.EDIT_TERMINAL)
})

test('Phase 1 Arbitration -- Reducer routes suspend, resume, and edit actions cleanly', (t) => {
    const model = new TerminalModel()

    const reducedSuspend = reducer(model, new ActTrm.SuspendTerminal({}))
    t.truthy(reducedSuspend)

    const reducedResume = reducer(model, new ActTrm.ResumeTerminal({}))
    t.truthy(reducedResume)

    const reducedEdit = reducer(
        model,
        new ActTrm.EditTerminal({
            src: 'test.json',
            dat: { editor: 'node', args: ['-e', 'process.exit(0)'] },
        }),
    )
    t.truthy(reducedEdit)
})

test('Phase 1 Arbitration -- suspendTerminal invokes screen.leave() safely', (t) => {
    const model = new TerminalModel()
    const leaveFake = sinon.fake()
    model.screen = { leave: leaveFake } as any

    const slv = sinon.fake()
    suspendTerminal(model, { slv } as any, null as any)

    t.true(leaveFake.calledOnce, 'Must call screen.leave once')
    t.true(slv.calledOnce, 'Must invoke bal.slv')
    t.is(slv.firstCall.args[0].trmBit.idx, 'suspend-terminal')
})

test('Phase 1 Arbitration -- resumeTerminal invokes screen.enter(), realloc(), and render()', (t) => {
    const model = new TerminalModel()
    const enterFake = sinon.fake()
    const reallocFake = sinon.fake()
    const renderFake = sinon.fake()
    model.screen = {
        enter: enterFake,
        realloc: reallocFake,
        render: renderFake,
    } as any

    const slv = sinon.fake()
    resumeTerminal(model, { slv } as any, null as any)

    t.true(enterFake.calledOnce, 'Must call screen.enter')
    t.true(reallocFake.calledOnce, 'Must call screen.realloc')
    t.true(renderFake.calledOnce, 'Must call screen.render')
    t.true(slv.calledOnce)
    t.is(slv.firstCall.args[0].trmBit.idx, 'resume-terminal')
})

test('Phase 1 Arbitration -- editTerminal executes suspension handshake and restores curses on exit', (t) => {
    const model = new TerminalModel()
    const leaveFake = sinon.fake()
    const enterFake = sinon.fake()
    const renderFake = sinon.fake()
    model.screen = {
        leave: leaveFake,
        enter: enterFake,
        render: renderFake,
        realloc: sinon.fake(),
    } as any

    const slv = sinon.fake()
    // Use an executable that returns 0 immediately (node -e "") to emulate clean editor exit
    const bal = {
        src: 'sample.json',
        dat: { editor: 'node', args: ['-e', '"process.exit(0)"'] },
        slv,
    } as any

    editTerminal(model, bal, null as any)

    t.true(
        leaveFake.calledOnce,
        'screen.leave must be called before editor spawn',
    )
    t.true(
        enterFake.calledOnce,
        'screen.enter must be called after editor exits',
    )
    t.true(renderFake.calledOnce, 'screen.render must repaint viewport')
    t.true(slv.calledOnce)
    t.is(slv.firstCall.args[0].trmBit.idx, 'edit-terminal')
    t.is(slv.firstCall.args[0].trmBit.val, 0)
})

test('Phase 1 Arbitration [NEG_CONTROL] -- editTerminal fails closed if no target file is supplied', (t) => {
    const model = new TerminalModel()
    const leaveFake = sinon.fake()
    const enterFake = sinon.fake()
    model.screen = {
        leave: leaveFake,
        enter: enterFake,
        render: sinon.fake(),
        realloc: sinon.fake(),
    } as any

    const slv = sinon.fake()
    const bal = { src: '', slv } as any

    editTerminal(model, bal, null as any)

    t.true(enterFake.calledOnce, 'Must restore screen even if error thrown')
    t.true(slv.calledOnce)
    t.is(slv.firstCall.args[0].trmBit.idx, 'edit-terminal-error')
    t.is(slv.firstCall.args[0].trmBit.val, -1)
})

test('Phase 1 Arbitration [NEG_CONTROL] -- editTerminal degrades gracefully in headless mode', (t) => {
    const model = new TerminalModel()
    model.screen = null

    const slv = sinon.fake()
    const bal = {
        src: 'sample.json',
        dat: { editor: 'node', args: ['-e', '"process.exit(0)"'] },
        slv,
    } as any

    t.notThrows(() => {
        editTerminal(model, bal, null as any)
    })

    t.true(slv.calledOnce)
    t.is(slv.firstCall.args[0].trmBit.idx, 'edit-terminal')
    t.is(slv.firstCall.args[0].trmBit.val, 0)
})
