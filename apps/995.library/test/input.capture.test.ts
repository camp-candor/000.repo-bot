import test from 'ava'
import sinon from 'sinon'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { InputModel } from '../995.library/84.input.unit/input.model'
import {
    openInput,
    initInput,
    updateInput,
} from '../995.library/84.input.unit/buz/input.buzz'
import { ChoiceModel } from '../995.library/85.choice.unit/choice.model'
import { openChoice } from '../995.library/85.choice.unit/buz/choice.buzz'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

test('84.input.unit -- initInput and updateInput fulfill standard bit lifecycle', (t) => {
    const model = new InputModel()
    const slvInit = sinon.fake()
    const slvUpd = sinon.fake()

    initInput(model, { slv: slvInit } as any, null as any)
    t.true(slvInit.calledOnce)
    t.is(slvInit.firstCall.args[0].putBit.idx, 'init-input')

    updateInput(model, { slv: slvUpd } as any, null as any)
    t.true(slvUpd.calledOnce)
    t.is(slvUpd.firstCall.args[0].putBit.idx, 'update-input')
})

test('84.input.unit -- openInput degrades gracefully in headless environments', (t) => {
    const model = new InputModel()
    const slv = sinon.fake()
    const bal = { src: 'test-seed', slv } as any
    const ste = { value: { terminal: {} } } as any

    openInput(model, bal, ste)

    t.true(slv.calledOnce)
    const res = slv.firstCall.args[0].putBit
    t.is(res.idx, 'open-input-headless')
    t.is(res.src, 'test-seed')
    t.is(res.val, 0)
})

test('84.input.unit -- openInput handles text submission and widget destruction', (t) => {
    const model = new InputModel()
    const slv = sinon.fake()
    let submitHandler: Function = () => {}

    const titleDestroy = sinon.fake()
    const inputDestroy = sinon.fake()
    const renderFake = sinon.fake()
    const unkeyFake = sinon.fake()

    const mockTitle = { destroy: titleDestroy }
    const mockInput = {
        focus: sinon.fake(),
        key: sinon.fake(),
        unkey: unkeyFake,
        destroy: inputDestroy,
        on: (evt: string, cb: Function) => {
            if (evt === 'submit') submitHandler = cb
        },
    }

    const mockBlessed = {
        textbox: (opts: any) =>
            opts.name === 'input-title' ? mockTitle : mockInput,
    }

    const ste = {
        value: {
            terminal: {
                blessed: mockBlessed,
                screen: { render: renderFake },
            },
        },
    } as any

    const bal = { txt: 'Enter Name', slv } as any

    openInput(model, bal, ste)

    // Simulate operator pressing enter on text
    submitHandler('unit_alpha')

    t.true(
        titleDestroy.calledOnce,
        'Title widget must be destroyed upon submit',
    )
    t.true(
        inputDestroy.calledOnce,
        'Input widget must be destroyed upon submit',
    )
    t.true(
        unkeyFake.calledWith(['escape']),
        'Escape listener must be unbound upon submit',
    )
    t.true(
        renderFake.calledTwice,
        'Screen must render on open and after cleanup',
    )
    t.true(slv.calledOnce, 'Resolver must be executed')
    const res = slv.firstCall.args[0].putBit
    t.is(res.idx, 'open-input')
    t.is(res.src, 'unit_alpha')
    t.is(res.val, 0)
})

test('84.input.unit -- openInput handles escape key cancellation cleanly', (t) => {
    const model = new InputModel()
    const slv = sinon.fake()
    let cancelHandler: Function = () => {}

    const titleDestroy = sinon.fake()
    const inputDestroy = sinon.fake()
    const unkeyFake = sinon.fake()

    const mockTitle = { destroy: titleDestroy }
    const mockInput = {
        focus: sinon.fake(),
        key: (keys: string[], cb: Function) => {
            if (keys.includes('escape')) cancelHandler = cb
        },
        unkey: unkeyFake,
        destroy: inputDestroy,
        on: sinon.fake(),
    }

    const mockBlessed = {
        textbox: (opts: any) =>
            opts.name === 'input-title' ? mockTitle : mockInput,
    }

    const ste = {
        value: {
            terminal: {
                blessed: mockBlessed,
                screen: { render: sinon.fake() },
            },
        },
    } as any

    openInput(model, { slv } as any, ste)

    // Simulate operator pressing Escape
    cancelHandler()

    t.true(titleDestroy.calledOnce)
    t.true(inputDestroy.calledOnce)
    t.true(unkeyFake.calledWith(['escape']))
    t.true(slv.calledOnce)
    const res = slv.firstCall.args[0].putBit
    t.is(res.idx, 'open-input-cancel')
    t.is(res.src, '')
    t.is(res.val, -1)
})

test('85.choice.unit -- openChoice handles escape key cancellation cleanly', (t) => {
    const model = new ChoiceModel()
    const slv = sinon.fake()

    const keyFake = sinon.fake()
    const unkeyFake = sinon.fake()
    const destroyFake = sinon.fake()
    let cancelHandler: Function = () => {}

    const mockForm = {
        _selected: null,
        focusPrevious: sinon.fake(),
        focusNext: sinon.fake(),
        cancel: () => cancelHandler(),
        destroy: destroyFake,
        on: (evt: string, cb: Function) => {
            if (evt === 'cancel') cancelHandler = cb
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
                    key: keyFake,
                    unkey: unkeyFake,
                    render: sinon.fake(),
                },
            },
        },
    } as any

    openChoice(model, { lst: ['OPTION 1'], slv } as any, ste)

    t.true(
        keyFake.calledWith(['escape']),
        'Must register escape handler on screen',
    )

    // Simulate cancel
    cancelHandler()

    t.true(
        unkeyFake.calledWith(['escape']),
        'Must unbind escape handler on cancel',
    )
    t.true(destroyFake.calledOnce, 'Must destroy form on cancel')
    t.true(slv.calledOnce)
    const res = slv.firstCall.args[0].chcBit
    t.is(res.idx, 'open-choice-cancel')
    t.is(res.val, -1)
})

test('Architectural Boundary Guard -- Zero detached CLI prompt packages in package.json', (t) => {
    const pkgJsonPath = path.resolve(__dirname, '../package.json')
    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'))
    const allDeps = {
        ...(pkgJson.dependencies || {}),
        ...(pkgJson.devDependencies || {}),
    }

    const bannedPackages = ['inquirer', '@clack/prompts', 'enquirer', 'prompts']
    for (const banned of bannedPackages) {
        t.false(
            banned in allDeps,
            `Package ${banned} is strictly banned from apps/995.library to prevent TTY stream contention`,
        )
    }
})
