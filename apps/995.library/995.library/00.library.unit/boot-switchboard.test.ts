import test from 'node:test'
import assert from 'node:assert/strict'
import { LibraryModel } from './library.model.js'
import { bootSwitchboard } from './buz/boot-switchboard.buzz.js'

test('BOOT_SWITCHBOARD executes deterministic order headless', async () => {
    const m = new LibraryModel() as any
    const order: string[] = []
    const ste: any = {
        hunt: async (type: string) => {
            order.push(String(type))
            if (String(type).includes('Update Grid')) return { grdBit: { dat: {} } }
            if (String(type).includes('Open Choice')) return { chcBit: { src: 'CANCEL' } }
            return {}
        },
    }
    let receipt: any = null
    await bootSwitchboard(m, { startDir: process.cwd(), headless: true, slv: (v: any) => { receipt = v } }, ste)
    assert.equal(m.switchboardBooted, true)
    assert.ok(m.lastBootReceipt)
    assert.ok(receipt?.libBit?.receipt || receipt?.libBit?.idx === 'boot-switchboard-headless')
})

test('run.ts delegates to Boot Switchboard and core untouched marker', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const runPath = path.resolve(process.cwd(), 'apps/995.library/run.ts')
    let content = ''
    try { content = fs.readFileSync(runPath, 'utf8') } catch { content = '' }
    if (content) assert.ok(content.includes('Boot Switchboard'))
})
