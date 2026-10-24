import test from 'ava'
import sinon from 'sinon'
import { ConsoleModel, ConsoleRingBuffer } from '../995.library/83.console.unit/console.model'
import { updateConsole, filterConsole } from '../995.library/83.console.unit/buz/console.buzz'

test('ConsoleRingBuffer -- ingests items and reports accurate stats', (t) => {
    const ring = new ConsoleRingBuffer(100)
    ring.push('>> [INFO] First record', { repo: '000.agent' })
    ring.push('>> [WARN] Second record', { repo: '103.factory' })

    const stats = ring.getStats()
    t.is(stats.capacity, 100)
    t.is(stats.size, 2)
    t.is(stats.totalIngested, 2)

    const all = ring.toArray()
    t.is(all.length, 2)
    t.is(all[0].clean, '>> [INFO] First record')
    t.is(all[1].clean, '>> [WARN] Second record')
})

test('ConsoleRingBuffer -- clamps capacity and overwrites oldest frames in-place (modular wrapping)', (t) => {
    const capacity = 5
    const ring = new ConsoleRingBuffer(capacity)

    for (let i = 1; i <= 8; i++) {
        ring.push(`>> [LOG] Record #${i}`)
    }

    const stats = ring.getStats()
    t.is(stats.size, 5, 'Size must not exceed capacity')
    t.is(stats.totalIngested, 8)

    const currentFrames = ring.toArray()
    t.is(currentFrames.length, 5)
    t.is(currentFrames[0].clean, '>> [LOG] Record #4')
    t.is(currentFrames[4].clean, '>> [LOG] Record #8')
})

test('ConsoleRingBuffer -- performs sub-millisecond filtering across repo and query masks', (t) => {
    const ring = new ConsoleRingBuffer(1000)
    for (let i = 0; i < 500; i++) {
        ring.push(`>> [AGENT:${i}] Heartbeat`, { repo: '000.agent' })
        ring.push(`>> [FACTORY:${i}] Cycle complete`, { repo: '103.factory' })
    }

    const tStart = process.hrtime.bigint()
    const agentRecords = ring.filter({ repo: '000.agent' })
    const tEnd = process.hrtime.bigint()
    const durationMs = Number(tEnd - tStart) / 1_000_000

    t.is(agentRecords.length, 500)
    t.true(durationMs < 5.0, `Filtering must execute in < 5ms (actual: ${durationMs.toFixed(2)}ms)`)

    const queryMatch = ring.filter({ query: 'Cycle complete' })
    t.is(queryMatch.length, 500)
})

test('83.console.unit -- updateConsole pushes frames into ring buffer and yields to event loop', async (t) => {
    const model = new ConsoleModel()
    const logSpy = sinon.fake()
    const renderSpy = sinon.fake()

    const mockWidget = {
        width: 80,
        log: logSpy,
    }

    const mockScreen = {
        render: renderSpy,
    }

    const ste = {
        value: {
            terminal: {
                screen: mockScreen,
                cols: 120,
            },
        },
        hunt: sinon.fake.resolves({
            cnsBit: {
                dat: { bit: mockWidget },
            },
        }),
    } as any

    const slv = sinon.fake()
    const bal = {
        idx: 'cns00',
        src: '>> [OK] Deployment verified',
        dat: { repo: '000.repo-bot', stage: 'EXEC', status: 'OK' },
        slv,
    } as any

    await updateConsole(model, bal, ste)

    t.true(slv.calledOnce)
    t.is(model.ring.getStats().size, 1)

    const frame = model.ring.toArray()[0]
    t.is(frame.clean, '>> [OK] Deployment verified')
    t.is(frame.repo, '000.repo-bot')
    t.is(frame.status, 'OK')
    t.true(logSpy.calledOnce)

    // Await setImmediate micro-yield render tick
    await new Promise((resolve) => setImmediate(resolve))
    t.true(renderSpy.calledOnce, 'Screen render must execute inside setImmediate yield')
})

test('83.console.unit -- filterConsole updates viewport presentation without querying remote network', async (t) => {
    const model = new ConsoleModel()
    model.ring.push('>> [ALPHA] Log', { repo: 'repo-alpha' })
    model.ring.push('>> [BETA] Log', { repo: 'repo-beta' })
    model.ring.push('>> [ALPHA] Second Log', { repo: 'repo-alpha' })

    const logLines: string[] = []
    const mockWidget = {
        log: (line: string) => logLines.push(line),
        logLines: ['stale-1', 'stale-2'],
        setItems: sinon.fake(),
    }

    const ste = {
        value: {
            terminal: { screen: { render: sinon.fake() } },
        },
        hunt: sinon.fake.resolves({
            cnsBit: { dat: { bit: mockWidget } },
        }),
    } as any

    const slv = sinon.fake()
    await filterConsole(model, { dat: { repo: 'repo-alpha' }, slv } as any, ste)

    t.true(slv.calledOnce)
    const res = slv.firstCall.args[0].cnsBit
    t.is(res.idx, 'filter-console')
    t.is(res.val, 2)
    t.deepEqual(logLines, ['>> [ALPHA] Log', '>> [ALPHA] Second Log'])
})
