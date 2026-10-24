import test from 'ava'
import sinon from 'sinon'
import path from 'path'
import fs from 'fs-extra'
import { UnitModel } from '../995.library/01.unit.unit/unit.model'
import {
    flattenUnit,
    createUnit,
    updateUnit,
} from '../995.library/01.unit.unit/buz/unit.buzz'

function makeBal(idx: string, src?: string, dat?: any) {
    return { idx, src, dat, slv: sinon.fake() } as any
}

function makeModel() {
    return new UnitModel()
}

const ste = null as any

test.serial(
    'flattenUnit -- flattens directory to root data/unit/<name>.txt without leaks',
    async (t) => {
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

        const tempDir = path.join(repoRoot, 'scratch_test_unit')
        await fs.ensureDir(path.join(tempDir, 'src'))
        await fs.ensureDir(path.join(tempDir, 'node_modules', 'dummy'))
        await fs.ensureDir(path.join(tempDir, 'dist'))
        await fs.ensureDir(path.join(tempDir, 'data'))

        await fs.writeFile(
            path.join(tempDir, 'src', 'index.ts'),
            'export const hello = "world";\n',
        )
        await fs.writeFile(
            path.join(tempDir, 'node_modules', 'dummy', 'index.js'),
            'export const leak = true;\n',
        )
        await fs.writeFile(
            path.join(tempDir, 'dist', 'bundle.js'),
            'export const compiled = true;\n',
        )
        await fs.writeFile(
            path.join(tempDir, 'data', 'store.json'),
            '{"key":"value"}',
        )

        const testIdx = 'test-scratch-unit'
        const bal = makeBal(testIdx, tempDir)

        const expectedOutputFile = path.join(
            repoRoot,
            'data',
            'unit',
            `${testIdx}.txt`,
        )

        t.teardown(async () => {
            await fs.remove(expectedOutputFile).catch(() => {})
            await fs.remove(tempDir).catch(() => {})
        })

        await flattenUnit(makeModel(), bal, ste)

        t.true(bal.slv.calledOnce, 'bal.slv should be called once')
        const result = bal.slv.firstCall.args[0]
        t.is(result.untBit.idx, 'flatten-unit')

        const relativeOutputPath = result.untBit.src
        t.true(
            relativeOutputPath.startsWith('data/unit/'),
            `Path must start with data/unit/, got: ${relativeOutputPath}`,
        )
        t.true(
            relativeOutputPath.endsWith('.txt'),
            `Path must end with .txt, got: ${relativeOutputPath}`,
        )

        const absoluteOutputFile = path.join(repoRoot, relativeOutputPath)
        t.true(
            fs.existsSync(absoluteOutputFile),
            `File should exist on disk at ${absoluteOutputFile}`,
        )

        const content = await fs.readFile(absoluteOutputFile, 'utf8')
        t.true(
            content.includes('export const hello = "world";'),
            'Should contain source code',
        )
        t.false(content.includes('leak'), 'Must not contain node_modules files')
        t.false(content.includes('compiled'), 'Must not contain dist files')
        t.false(content.includes('store.json'), 'Must not contain data files')
    },
)

test.serial(
    'createUnit -- scaffolds templates deterministically with zero artificial latency',
    async (t) => {
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

        const testVerb = 'weather'
        const targetRelativeDir = `data/unit/00.${testVerb}.unit`
        const bal = makeBal(testVerb, 'data/unit')
        const targetAbsoluteDir = path.join(repoRoot, targetRelativeDir)

        t.teardown(async () => {
            await fs.remove(targetAbsoluteDir).catch(() => {})
        })

        const startTime = Date.now()
        await createUnit(makeModel(), bal, ste)
        const elapsed = Date.now() - startTime

        t.true(bal.slv.calledOnce, 'bal.slv must be called immediately upon file creation')
        t.true(
            elapsed < 1000,
            `Execution must complete without artificial delays; elapsed: ${elapsed}ms`,
        )

        const result = bal.slv.firstCall.args[0]
        t.is(result.untBit.idx, 'create-unit')

        t.true(
            result.untBit.src.startsWith(targetRelativeDir),
            `Expected ${targetRelativeDir}, got: ${result.untBit.src}`,
        )

        t.true(
            fs.existsSync(targetAbsoluteDir),
            'Target unit directory must exist on disk',
        )

        const expectedFiles = [
            'weather.action.ts',
            'weather.buzzer.ts',
            'weather.model.ts',
            'weather.reduce.ts',
            'weather.unit.ts',
            'buz/weather.buzz.ts',
            'fce/weather.interface.ts',
            'fce/weather.bit.ts',
        ]

        for (const relFile of expectedFiles) {
            const fullFilePath = path.join(targetAbsoluteDir, relFile)
            t.true(
                fs.existsSync(fullFilePath),
                `Missing scaffolded file: ${relFile}`,
            )
        }
    },
)

test.serial(
    'createUnit -- routes directly to active package workspace when src is provided',
    async (t) => {
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

        const scratchPkg = path.join(repoRoot, 'scratch_target_pkg')
        await fs.ensureDir(scratchPkg)

        const testVerb = 'radar'
        const bal = makeBal(testVerb, scratchPkg)
        const expectedTargetDir = path.join(scratchPkg, `00.${testVerb}.unit`)

        t.teardown(async () => {
            await fs.remove(scratchPkg).catch(() => {})
        })

        const startTime = Date.now()
        await createUnit(makeModel(), bal, ste)
        const elapsed = Date.now() - startTime

        t.true(bal.slv.calledOnce, 'bal.slv must resolve immediately')
        t.true(elapsed < 1000, 'Must execute without latency sentinels')
        t.true(fs.existsSync(expectedTargetDir), 'Target unit must exist inside designated package workspace')
        t.true(fs.existsSync(path.join(expectedTargetDir, 'radar.unit.ts')))
    },
)

test.serial(
    'createUnit -- routes to data/unit by default when bal.src is omitted',
    async (t) => {
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

        const testVerb = 'compass'
        const expectedRelDir = `data/unit/00.${testVerb}.unit`
        const expectedTargetDir = path.join(repoRoot, expectedRelDir)
        const bal = makeBal(testVerb) // bal.src is undefined

        t.teardown(async () => {
            await fs.remove(expectedTargetDir).catch(() => {})
        })

        await createUnit(makeModel(), bal, ste)

        t.true(bal.slv.calledOnce, 'bal.slv must resolve immediately')
        const result = bal.slv.firstCall.args[0]
        t.is(result.untBit.idx, 'create-unit')
        t.true(
            result.untBit.src.startsWith(expectedRelDir),
            `Expected ${expectedRelDir}, got: ${result.untBit.src}`,
        )
        t.true(fs.existsSync(expectedTargetDir), 'Target unit must exist inside data/unit')
        t.true(fs.existsSync(path.join(expectedTargetDir, 'compass.unit.ts')))
    },
)

test.serial(
    'updateUnit -- resiliently injects action, reducer, buzzer, and buzz into formatted unit files',
    async (t) => {
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

        const tempDir = path.join(repoRoot, 'scratch_resilient_update')
        const unitDir = path.join(tempDir, '00.sensor.unit')
        const buzDir = path.join(unitDir, 'buz')
        await fs.ensureDir(buzDir)

        // Seed with realistic Prettier-formatted multiline action file
        const initialAction = `import type { Action } from '../99.core/interface/action.interface'
import type SensorBit from './fce/sensor.bit'

export const INIT_SENSOR = '[Sensor action] Init Sensor'
export class InitSensor implements Action {
    readonly type = INIT_SENSOR
    constructor(public bale: SensorBit) {}
}

export type Actions =
    | InitSensor;
`

        // Seed with realistic switch-case reduce file
        const initialReduce = `import clone from 'clone-deep'
import * as Act from './sensor.action'
import { SensorModel } from './sensor.model'
import * as Buzz from './sensor.buzzer'
import type State from '../99.core/state'

export function reducer(
    model: SensorModel = new SensorModel(),
    act: Act.Actions,
    state?: State,
) {
    switch (act.type) {
        case Act.INIT_SENSOR:
            return Buzz.initSensor(clone(model), act.bale, state)

        default:
            return model
    }
}
`

        const initialBuzzer = `export { initSensor } from './buz/sensor.buzz';\n`
        const initialBuzz = `import type { SensorModel } from '../sensor.model'
import type SensorBit from '../fce/sensor.bit'
import type State from '../../99.core/state'

export const initSensor = (cpy: SensorModel, bal: SensorBit, ste: State) => {
    return cpy
}
`

        await fs.writeFile(path.join(unitDir, 'sensor.action.ts'), initialAction)
        await fs.writeFile(path.join(unitDir, 'sensor.reduce.ts'), initialReduce)
        await fs.writeFile(path.join(unitDir, 'sensor.buzzer.ts'), initialBuzzer)
        await fs.writeFile(path.join(buzDir, 'sensor.buzz.ts'), initialBuzz)

        t.teardown(async () => {
            await fs.remove(tempDir).catch(() => {})
        })

        // 1. First execution: inject 'read' action
        const bal = makeBal('00.sensor.unit', tempDir, 'read')
        const startTime = Date.now()
        await updateUnit(makeModel(), bal, ste)
        const elapsed = Date.now() - startTime

        t.true(bal.slv.calledOnce, 'bal.slv should resolve immediately')
        t.true(elapsed < 1000, `updateUnit must not sleep; elapsed: ${elapsed}ms`)

        const actionContent = await fs.readFile(path.join(unitDir, 'sensor.action.ts'), 'utf8')
        const reduceContent = await fs.readFile(path.join(unitDir, 'sensor.reduce.ts'), 'utf8')
        const buzzerContent = await fs.readFile(path.join(unitDir, 'sensor.buzzer.ts'), 'utf8')
        const buzzContent = await fs.readFile(path.join(buzDir, 'sensor.buzz.ts'), 'utf8')

        // Verify action injection
        t.true(actionContent.includes('export const READ_SENSOR = "[Read action] Read Sensor"'))
        t.true(actionContent.includes('export class ReadSensor implements Action'))
        t.true(actionContent.includes('| ReadSensor;'))

        // Verify reduce injection
        t.true(reduceContent.includes('case Act.READ_SENSOR:'))
        t.true(reduceContent.includes('return Buzz.readSensor(clone(model), act.bale, state)'))

        // Verify buzzer and buzz injection
        t.true(buzzerContent.includes('export { readSensor } from "./buz/sensor.buzz"'))
        t.true(buzzContent.includes('export const readSensor = async'))

        // 2. Second execution: Idempotency check
        const balDuplicate = makeBal('00.sensor.unit', tempDir, 'read')
        await updateUnit(makeModel(), balDuplicate, ste)

        t.true(balDuplicate.slv.calledOnce)
        t.is(balDuplicate.slv.firstCall.args[0].untBit.skipped, true, 'Duplicate mutation must be skipped')

        const actionContentPostIdempotent = await fs.readFile(path.join(unitDir, 'sensor.action.ts'), 'utf8')
        const occurrences = (actionContentPostIdempotent.match(/READ_SENSOR/g) || []).length
        t.is(occurrences, 2, 'Constants/types must not be duplicated on successive runs')
    },
)
