import test from 'ava'
import sinon from 'sinon'
import fs from 'node:fs'
import path from 'node:path'
import { HotkeyModel } from '../00.hotkey.unit/hotkey.model.js'
import {
    executeHotkey,
    resolveRepoRoot,
    DEFAULT_CENTER_MOUSE_SCRIPT,
} from '../00.hotkey.unit/buz/hotkey.buzz'

test.serial(
    'executeHotkey executes via stdin without creating data/hotkey or disk files',
    async (t) => {
        const repoRoot = resolveRepoRoot()
        const hotkeyDir = path.join(repoRoot, 'data', 'hotkey')

        // Pre-assert or clean up if previously created
        if (fs.existsSync(hotkeyDir)) {
            fs.rmSync(hotkeyDir, { recursive: true, force: true })
        }

        const slv = sinon.fake()
        const bal = {
            idx: 'test-stdin-hotkey',
            slv,
        } as any

        const ste = {
            hunt: sinon.fake.resolves({}),
        } as any

        await executeHotkey(new HotkeyModel(), bal, ste)

        // Verify zero disk footprint
        t.false(
            fs.existsSync(hotkeyDir),
            'Directory data/hotkey must NOT exist on disk',
        )

        t.true(slv.calledOnce, 'bal.slv must be resolved')
        const response = slv.firstCall.args[0]
        t.truthy(response.htkBit)
        t.is(response.htkBit.val, 1)
        t.is(response.htkBit.src, 'in-memory-stdin')
        t.is(response.htkBit.dat.mode, 'STDIN_IN_MEMORY')
    },
)

test.serial(
    'executeHotkey passes custom script in-memory without creating files',
    async (t) => {
        const repoRoot = resolveRepoRoot()
        const hotkeyDir = path.join(repoRoot, 'data', 'hotkey')

        const slv = sinon.fake()
        const customScript = 'MouseMove, 200, 200, 0\nExitApp\n'
        const bal = {
            idx: 'test-custom-stdin',
            src: customScript,
            slv,
        } as any

        const ste = {
            hunt: sinon.fake.resolves({}),
        } as any

        await executeHotkey(new HotkeyModel(), bal, ste)

        t.false(
            fs.existsSync(hotkeyDir),
            'Directory data/hotkey must not be created for custom scripts',
        )
        t.true(slv.calledOnce)
        const response = slv.firstCall.args[0]
        t.is(response.htkBit.val, 1)
        t.is(response.htkBit.dat.mode, 'STDIN_IN_MEMORY')
    },
)
