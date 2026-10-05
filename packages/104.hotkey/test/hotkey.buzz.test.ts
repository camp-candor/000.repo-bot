import test from 'ava'
import sinon from 'sinon'
import fs from 'node:fs'
import path from 'node:path'
import { HotkeyModel } from '../00.hotkey.unit/hotkey.model.js'
import {
    executeHotkey,
    resolveRepoRoot,
    DEFAULT_000_AHK_BODY,
} from '../00.hotkey.unit/buz/hotkey.buzz.js'

test.serial(
    'executeHotkey auto-creates data/hotkey and 000..ahk if missing',
    async (t) => {
        const repoRoot = resolveRepoRoot()
        const hotkeyDir = path.join(repoRoot, 'data', 'hotkey')
        const defaultAhk = path.join(hotkeyDir, '000..ahk')

        // Backup existing 000..ahk if present in test environment
        let existingContent: string | null = null
        if (fs.existsSync(defaultAhk)) {
            existingContent = fs.readFileSync(defaultAhk, 'utf8')
            fs.unlinkSync(defaultAhk)
        }

        const slv = sinon.fake()
        const bal = {
            idx: 'test-hotkey',
            slv,
        } as any

        const ste = {
            hunt: sinon.fake.resolves({}),
        } as any

        try {
            await executeHotkey(new HotkeyModel(), bal, ste)

            t.true(
                fs.existsSync(hotkeyDir),
                'Directory data/hotkey must exist on disk',
            )
            t.true(
                fs.existsSync(defaultAhk),
                'Default script 000..ahk must be synthesized',
            )

            const content = fs.readFileSync(defaultAhk, 'utf8')
            t.true(
                content.includes('MouseMove, %CenterX%, %CenterY%, 5'),
                'Must include mouse centering instruction',
            )
            t.true(
                content.includes('CoordMode, Mouse, Screen'),
                'Must use screen coordinate mode',
            )

            t.true(slv.calledOnce, 'bal.slv must be resolved')
            const response = slv.firstCall.args[0]
            t.truthy(response.htkBit)
            t.is(response.htkBit.val, 1)
        } finally {
            // Teardown or restore original content
            if (existingContent !== null) {
                fs.writeFileSync(defaultAhk, existingContent, 'utf8')
            } else if (fs.existsSync(defaultAhk)) {
                fs.unlinkSync(defaultAhk)
            }
        }
    },
)

test.serial(
    'executeHotkey reports error for non-existent custom script',
    async (t) => {
        const slv = sinon.fake()
        const bal = {
            idx: 'test-custom-missing',
            src: 'non_existent_macro',
            slv,
        } as any

        const ste = {
            hunt: sinon.fake.resolves({}),
        } as any

        await executeHotkey(new HotkeyModel(), bal, ste)

        t.true(slv.calledOnce, 'bal.slv must be resolved')
        const response = slv.firstCall.args[0]
        t.is(response.htkBit.idx, 'execute-hotkey-error')
        t.is(response.htkBit.val, 0)
    },
)
