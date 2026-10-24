import test from 'ava'
import sinon from 'sinon'
import fs from 'fs'
import path from 'path'
import { DataModel } from '../995.library/03.data.unit/data.model'
import {
    initData,
    updateData,
    frameData,
} from '../995.library/03.data.unit/buz/data.buzz'

test('Phase 1 Invariant: data.buzz.ts contains zero debugger statements', (t) => {
    const filePath = path.resolve(
        __dirname,
        '../995.library/03.data.unit/buz/data.buzz.ts',
    )
    const content = fs.readFileSync(filePath, 'utf8')
    t.false(
        content.includes('debugger'),
        'data.buzz.ts must not contain debugger statements',
    )
})

test('initData -- resolves bal.slv immediately with datBit contract', async (t) => {
    const model = new DataModel()
    const slv = sinon.fake()
    const bal = { idx: 'test-init', slv } as any

    const result = await initData(model, bal, null as any)

    t.is(result, model)
    t.true(slv.calledOnce, 'bal.slv must be invoked immediately')
    const payload = slv.firstCall.args[0]
    t.is(payload.datBit.idx, 'init-data')
})

test('initData -- streams 7-bit ASCII telemetry to cns00 when ste is provided', async (t) => {
    const model = new DataModel()
    const slv = sinon.fake()
    const hunt = sinon.fake.resolves({})
    const ste = { hunt } as any
    const bal = { idx: 'test-init', slv } as any

    await initData(model, bal, ste)

    t.true(slv.calledOnce)
    t.true(hunt.calledOnce, 'ste.hunt must be called to update console')
    const huntPayload = hunt.firstCall.args[1]
    t.is(huntPayload.idx, 'cns00')
    t.regex(huntPayload.src, /^>> \[DATA:INIT\] \[OK\]/)
    t.regex(
        huntPayload.src,
        /^[\x00-\x7F]*$/,
        'Console telemetry must be pure 7-bit ASCII',
    )
})

test('updateData -- resolves bal.slv immediately without blocking', async (t) => {
    const model = new DataModel()
    const slv = sinon.fake()
    const bal = { idx: 'test-update', slv } as any

    const result = await updateData(model, bal, null as any)

    t.is(result, model)
    t.true(slv.calledOnce)
    const payload = slv.firstCall.args[0]
    t.is(payload.datBit.idx, 'update-data')
})

test('frameData -- resolves bal.slv with output parameters and frames', async (t) => {
    const model = new DataModel()
    const slv = sinon.fake()
    const bal = {
        idx: 'test-frame',
        src: 'sequence01.mp4',
        val: 24,
        dat: { outputDir: 'tmp/frames_test' },
        slv,
    } as any

    const result = await frameData(model, bal, null as any)

    t.is(result, model)
    t.true(slv.calledOnce)
    const payload = slv.firstCall.args[0]
    t.is(payload.datBit.idx, 'frame-data')
    t.is(payload.datBit.src, 'tmp/frames_test')
    t.is(payload.datBit.val, 24)
})

test('Defensive execution: buzzers handle missing bal and bal.slv without throwing', async (t) => {
    const model = new DataModel()

    await t.notThrowsAsync(async () => {
        await initData(model, null as any, null as any)
        await updateData(model, null as any, null as any)
        await frameData(model, null as any, null as any)
    })
})
