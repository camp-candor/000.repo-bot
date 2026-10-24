import test from 'ava'
import sinon from 'sinon'
import fs from 'fs'
import path from 'path'
import * as ActCns from '../995.library/83.console.unit/console.action'
import { DataModel } from '../995.library/03.data.unit/data.model'
import {
    initData,
    updateData,
    frameData,
    sanitizeTo7BitAscii,
    formatDataTelemetry,
    emitDataTelemetry,
} from '../995.library/03.data.unit/buz/data.buzz'

test('Phase 2 Invariant: data.buzz.ts strictly bans raw console.log and console.error', (t) => {
    const filePath = path.resolve(
        __dirname,
        '../995.library/03.data.unit/buz/data.buzz.ts',
    )
    const content = fs.readFileSync(filePath, 'utf8')

    t.false(
        /console\.log\s*\(/.test(content),
        'data.buzz.ts must not contain console.log statements',
    )
    t.false(
        /console\.error\s*\(/.test(content),
        'data.buzz.ts must not contain console.error statements',
    )
    t.false(
        /console\.warn\s*\(/.test(content),
        'data.buzz.ts must not contain console.warn statements',
    )
})

test('sanitizeTo7BitAscii -- purges emojis, multi-byte UTF-8 glyphs, and ANSI escape codes', (t) => {
    const dirtyInput = '\u001b[31m>> [ERROR] ' + String.fromCodePoint(0x1F680) + ' Rendering frame 42 failed! ' + String.fromCodePoint(0x26A0, 0xFE0F) + '\u001b[0m'
    const cleanOutput = sanitizeTo7BitAscii(dirtyInput)

    t.is(cleanOutput, '>> [ERROR]  Rendering frame 42 failed!')
    t.regex(
        cleanOutput,
        /^[\x00-\x7F]*$/,
        'Sanitized string must be strictly 7-bit ASCII',
    )
})

test('formatDataTelemetry -- formats standard columnar bracketed tokens', (t) => {
    const lineWithStatus = formatDataTelemetry({
        stage: 'INIT',
        status: 'OK',
        message: 'Subsystem booted',
    })
    t.is(lineWithStatus, '>> [DATA:INIT] [OK] Subsystem booted')

    const lineWithoutStatus = formatDataTelemetry({
        stage: 'PREP',
        message: 'Cleaning spool buffer',
    })
    t.is(lineWithoutStatus, '>> [DATA:PREP] Cleaning spool buffer')
})

test('emitDataTelemetry -- dispatches to cns00 using ActCns.UPDATE_CONSOLE', async (t) => {
    const hunt = sinon.fake.resolves({})
    const ste = { hunt } as any

    await emitDataTelemetry(ste, {
        stage: 'EXEC',
        message: 'Running transcode task',
    })

    t.true(hunt.calledOnce, 'ste.hunt must be called once')
    const [actionType, payload] = hunt.firstCall.args
    t.is(actionType, ActCns.UPDATE_CONSOLE)
    t.is(payload.idx, 'cns00')
    t.is(payload.src, '>> [DATA:EXEC] Running transcode task')
})

test('emitDataTelemetry -- degrades gracefully when ste is null or ste.hunt throws', async (t) => {
    // Null state check
    await t.notThrowsAsync(async () => {
        await emitDataTelemetry(null, { stage: 'INIT', message: 'noop' })
    })

    // Fault injection check
    const rejectingSte = {
        hunt: sinon.fake.rejects(new Error('Terminal buffer locked')),
    } as any

    await t.notThrowsAsync(async () => {
        await emitDataTelemetry(rejectingSte, {
            stage: 'ERR',
            message: 'Faulted cleanly',
        })
    })
})

test('initData and updateData -- route execution receipts through emitDataTelemetry to cns00', async (t) => {
    const model = new DataModel()
    const hunt = sinon.fake.resolves({})
    const ste = { hunt } as any
    const slv = sinon.fake()
    const bal = { slv } as any

    await initData(model, bal, ste)
    t.true(hunt.calledOnce)
    t.is(hunt.firstCall.args[1].src, '>> [DATA:INIT] [OK] Initializing media data plane boundaries...')
    t.true(slv.calledOnce)

    hunt.resetHistory()
    slv.resetHistory()

    await updateData(model, bal, ste)
    t.true(hunt.calledOnce)
    t.is(hunt.firstCall.args[1].src, '>> [DATA:UPDATE] [OK] Updating media data plane configuration...')
    t.true(slv.calledOnce)
})

test('frameData -- emits PREP, EXEC, and COMP telemetry lines in sequence to cns00', async (t) => {
    const model = new DataModel()
    const hunt = sinon.fake.resolves({})
    const ste = { hunt } as any
    const slv = sinon.fake()
    const bal = {
        src: 'clip.mp4',
        val: 24,
        dat: { outputDir: 'tmp/out' },
        slv,
    } as any

    await frameData(model, bal, ste)

    t.is(hunt.callCount, 3, 'Must emit PREP, EXEC, and COMP telemetry events')
    t.is(hunt.getCall(0).args[1].src, '>> [DATA:PREP] Scrubbing local media spool: tmp/out')
    t.is(hunt.getCall(1).args[1].src, '>> [DATA:EXEC] Spawning media processing pipeline: ../films/clip.mp4 -> tmp/out')
    t.is(hunt.getCall(2).args[1].src, '>> [DATA:COMP] [OK] Extraction pass completed for 24 frames.')

    t.true(slv.calledOnce)
    t.is(slv.firstCall.args[0].datBit.idx, 'frame-data')
})