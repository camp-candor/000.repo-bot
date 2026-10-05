import test from 'ava'
import sinon from 'sinon'
import fs from 'node:fs'
import path from 'node:path'
import { HotkeyModel } from '../00.hotkey.unit/hotkey.model.js'
import {
    executeHotkey,
    resolveRepoRoot,
    DEFAULT_CENTER_MOUSE_SCRIPT,
} from '../00.hotkey.unit/buz/hotkey.buzz.js'

test.serial(
    'executeHotkey executes in-memory calibration script via native stdin pipe with zero disk footprint',
    async (t) => {
        const repoRoot = resolveRepoRoot()
        const hotkeyDir = path.join(repoRoot, 'data', 'hotkey')

        // Assert data/hotkey does NOT exist before execution
        t.false(
            fs.existsSync(hotkeyDir),
            'Directory data/hotkey must NOT exist before execution',
        )

        const slv = sinon.fake()
        const bal = {
            idx: 'test-hotkey-default',
            slv,
        } as any

        const ste = {
            hunt: sinon.fake.resolves({}),
        } as any

        await executeHotkey(new HotkeyModel(), bal, ste)

        // Assert data/hotkey does NOT exist after execution
        t.false(
            fs.existsSync(hotkeyDir),
            'Directory data/hotkey must NOT exist after in-memory execution',
        )

        t.true(slv.calledOnce, 'bal.slv must be resolved')
        const response = slv.firstCall.args[0]
        t.truthy(response.htkBit, 'htkBit must be present')
        t.is(response.htkBit.val, 1, 'htkBit.val must be 1')
        t.truthy(response.htkBit.dat, 'htkBit.dat must be present')
        t.is(
            response.htkBit.dat.mode,
            'STDIN_IN_MEMORY',
            'Execution mode must be STDIN_IN_MEMORY',
        )
        t.true(
            response.htkBit.src.includes('MouseMove, %CenterX%, %CenterY%, 5'),
            'Must contain mouse centering instruction',
        )
        t.true(
            response.htkBit.src.includes('ExitApp'),
            'Must contain ExitApp instruction',
        )
    },
)

test.serial(
    'executeHotkey executes custom in-memory script via native stdin pipe without disk creation',
    async (t) => {
        const repoRoot = resolveRepoRoot()
        const hotkeyDir = path.join(repoRoot, 'data', 'hotkey')

        t.false(
            fs.existsSync(hotkeyDir),
            'Directory data/hotkey must NOT exist before execution',
        )

        const customScript = 'MouseMove, 200, 200, 5\nExitApp'
        const slv = sinon.fake()
        const bal = {
            idx: 'test-custom-script',
            src: customScript,
            slv,
        } as any

        const ste = {
            hunt: sinon.fake.resolves({}),
        } as any

        await executeHotkey(new HotkeyModel(), bal, ste)

        t.false(
            fs.existsSync(hotkeyDir),
            'Directory data/hotkey must NOT exist after custom execution',
        )

        t.true(slv.calledOnce, 'bal.slv must be resolved')
        const response = slv.firstCall.args[0]
        t.truthy(response.htkBit)
        t.is(response.htkBit.val, 1)
        t.is(response.htkBit.dat.mode, 'STDIN_IN_MEMORY')
        t.is(response.htkBit.src, customScript)
    },
)

test.serial(
    'executeHotkey handles non-Windows platform bypass safely with val: 1 and mode: STDIN_IN_MEMORY',
    async (t) => {
        const repoRoot = resolveRepoRoot()
        const hotkeyDir = path.join(repoRoot, 'data', 'hotkey')

        const originalPlatform = process.platform
        try {
            Object.defineProperty(process, 'platform', {
                value: 'linux',
                configurable: true,
            })

            const slv = sinon.fake()
            const bal = {
                idx: 'test-linux-bypass',
                slv,
            } as any

            const ste = {
                hunt: sinon.fake.resolves({}),
            } as any

            await executeHotkey(new HotkeyModel(), bal, ste)

            t.false(fs.existsSync(hotkeyDir))
            t.true(slv.calledOnce)
            const response = slv.firstCall.args[0]
            t.is(response.htkBit.val, 1)
            t.is(response.htkBit.dat.mode, 'STDIN_IN_MEMORY')
            t.is(response.htkBit.dat.platform, 'linux')
        } finally {
            Object.defineProperty(process, 'platform', {
                value: originalPlatform,
                configurable: true,
            })
        }
    },
)
