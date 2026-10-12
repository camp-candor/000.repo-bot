import test from 'ava'
import sinon from 'sinon'
import { ChoiceModel } from '../995.library/85.choice.unit/choice.model'
import {
    openChoice,
    initChoice,
    updateChoice,
} from '../995.library/85.choice.unit/buz/choice.buzz'

test('openChoice -- handles headless environment cleanly without throwing', (t) => {
    const model = new ChoiceModel()
    const slv = sinon.fake()
    const bal = {
        idx: 'test-choice',
        lst: ['OPTION A', 'OPTION B'],
        slv,
    } as any

    const ste = {
        value: {
            terminal: {},
        },
    } as any

    openChoice(model, bal, ste)

    t.true(
        slv.calledOnce,
        'Resolver must be called immediately in headless state',
    )
    const result = slv.firstCall.args[0]
    t.is(result.chcBit.idx, 'open-choice-headless')
    t.is(result.chcBit.src, 'OPTION A')
})

test('openChoice -- binds vertical navigation keys and unbinds on submit', (t) => {
    const model = new ChoiceModel()
    const slv = sinon.fake()

    const unkeyFake = sinon.fake()
    const keyFake = sinon.fake()
    const renderFake = sinon.fake()
    const destroyFake = sinon.fake()

    let submitHandler: Function = () => {}

    const mockButton = {
        on: sinon.fake(),
        focus: sinon.fake(),
        content: 'OPTION A',
        index: 1,
    }

    const mockForm = {
        _selected: mockButton,
        focusPrevious: sinon.fake(),
        focusNext: sinon.fake(),
        destroy: destroyFake,
        on: (event: string, handler: Function) => {
            if (event === 'submit') submitHandler = handler
        },
    }

    const mockBlessed = {
        form: () => mockForm,
        button: () => mockButton,
    }

    const mockScreen = {
        key: keyFake,
        unkey: unkeyFake,
        render: renderFake,
    }

    const ste = {
        value: {
            terminal: {
                blessed: mockBlessed,
                screen: mockScreen,
            },
        },
    } as any

    const bal = {
        idx: 'test-choice',
        lst: ['OPTION A', 'OPTION B'],
        slv,
    } as any

    openChoice(model, bal, ste)

    // Assert vertical keys ('up', 'k') and ('down', 'j') were bound
    t.true(keyFake.calledWith(['up', 'k']), 'Must bind up/k keys')
    t.true(keyFake.calledWith(['down', 'j']), 'Must bind down/j keys')

    // Simulate submission
    submitHandler()

    // Assert cleanup occurred
    t.true(unkeyFake.calledWith(['up', 'k']), 'Must unbind up/k keys on submit')
    t.true(
        unkeyFake.calledWith(['down', 'j']),
        'Must unbind down/j keys on submit',
    )
    t.true(destroyFake.calledOnce, 'Must destroy form widget on submit')
    t.true(slv.calledOnce, 'Must resolve bal.slv upon submit')
    t.is(slv.firstCall.args[0].chcBit.src, 'OPTION A')
})

test('openChoice -- executes focus callback (dat.cb) when option receives focus', (t) => {
    const model = new ChoiceModel()
    const cbSpy = sinon.fake()
    let focusHandler: Function = () => {}

    const mockButton = {
        on: (event: string, handler: Function) => {
            if (event === 'focus') focusHandler = handler
        },
        focus: sinon.fake(),
        content: 'ITEM ALPHA',
        index: 1,
    }

    const mockForm = {
        _selected: mockButton,
        focusPrevious: sinon.fake(),
        focusNext: sinon.fake(),
        destroy: sinon.fake(),
        on: sinon.fake(),
    }

    const ste = {
        value: {
            terminal: {
                blessed: {
                    form: () => mockForm,
                    button: () => mockButton,
                },
                screen: {
                    key: sinon.fake(),
                    unkey: sinon.fake(),
                    render: sinon.fake(),
                },
            },
        },
    } as any

    const bal = {
        idx: 'test-cb',
        lst: ['ITEM ALPHA'],
        dat: { cb: cbSpy },
    } as any

    openChoice(model, bal, ste)

    focusHandler()

    t.true(cbSpy.calledOnce, 'dat.cb must be called when button focus fires')
    t.is(cbSpy.firstCall.args[0], 'ITEM ALPHA')
})

test('openChoice -- handles empty item lists cleanly without throws', (t) => {
    const model = new ChoiceModel()
    const slv = sinon.fake()
    let submitHandler: Function = () => {}

    const mockForm = {
        _selected: null,
        focusPrevious: sinon.fake(),
        focusNext: sinon.fake(),
        destroy: sinon.fake(),
        on: (event: string, handler: Function) => {
            if (event === 'submit') submitHandler = handler
        },
    }

    const ste = {
        value: {
            terminal: {
                blessed: {
                    form: () => mockForm,
                    button: () => ({ on: sinon.fake(), focus: sinon.fake() }),
                },
                screen: {
                    key: sinon.fake(),
                    unkey: sinon.fake(),
                    render: sinon.fake(),
                },
            },
        },
    } as any

    const bal = {
        idx: 'empty-test',
        lst: [],
        slv,
    } as any

    openChoice(model, bal, ste)
    submitHandler()

    t.true(slv.calledOnce)
    t.is(slv.firstCall.args[0].chcBit.src, '')
})

test('openChoice -- dynamic leak test: verifies 0 listener accumulation across 100 cycles', (t) => {
    const listeners: Record<string, Function[]> = {}

    const keyFake = (keys: string[], fn: Function) => {
        keys.forEach((k) => {
            listeners[k] = listeners[k] || []
            listeners[k].push(fn)
        })
    }

    const unkeyFake = (keys: string[], fn: Function) => {
        keys.forEach((k) => {
            if (listeners[k]) {
                listeners[k] = listeners[k].filter((h) => h !== fn)
            }
        })
    }

    let destroyedCount = 0

    const mockScreen = {
        key: keyFake,
        unkey: unkeyFake,
        render: sinon.fake(),
    }

    const makeSte = (onSubmitTrigger: { current: Function | null }) =>
        ({
            value: {
                terminal: {
                    blessed: {
                        form: () => ({
                            _selected: { content: 'TEST', index: 1 },
                            destroy: () => {
                                destroyedCount++
                            },
                            on: (event: string, cb: Function) => {
                                if (event === 'submit')
                                    onSubmitTrigger.current = cb
                            },
                        }),
                        button: () => ({
                            on: sinon.fake(),
                            focus: sinon.fake(),
                        }),
                    },
                    screen: mockScreen,
                },
            },
        }) as any

    const totalCycles = 100

    for (let i = 0; i < totalCycles; i++) {
        const onSubmitTrigger = { current: null as Function | null }
        const ste = makeSte(onSubmitTrigger)

        openChoice(
            new ChoiceModel(),
            {
                idx: `cycle-${i}`,
                lst: ['CHOICE 1', 'CHOICE 2'],
                slv: sinon.fake(),
            } as any,
            ste,
        )

        // Trigger form submit to engage atomic cleanup
        if (onSubmitTrigger.current) {
            onSubmitTrigger.current()
        }
    }

    const upListeners = listeners['up']?.length || 0
    const downListeners = listeners['down']?.length || 0
    const kListeners = listeners['k']?.length || 0
    const jListeners = listeners['j']?.length || 0

    t.is(
        upListeners,
        0,
        'No lingering "up" listeners permitted after 100 iterations',
    )
    t.is(
        downListeners,
        0,
        'No lingering "down" listeners permitted after 100 iterations',
    )
    t.is(
        kListeners,
        0,
        'No lingering "k" listeners permitted after 100 iterations',
    )
    t.is(
        jListeners,
        0,
        'No lingering "j" listeners permitted after 100 iterations',
    )
    t.is(
        destroyedCount,
        totalCycles,
        'Every allocated form widget must be destroyed',
    )
})

test('initChoice and updateChoice -- resolve immediately with no blocking debugger halts', (t) => {
    const model = new ChoiceModel()
    const slvInit = sinon.fake()
    const slvUpdate = sinon.fake()

    initChoice(model, { idx: 'init', slv: slvInit } as any, null as any)
    updateChoice(model, { idx: 'update', slv: slvUpdate } as any, null as any)

    t.true(slvInit.calledOnce)
    t.is(slvInit.firstCall.args[0].chcBit.idx, 'init-choice')

    t.true(slvUpdate.calledOnce)
    t.is(slvUpdate.firstCall.args[0].chcBit.idx, 'update-choice')
})
