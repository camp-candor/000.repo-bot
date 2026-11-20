import test from 'node:test'
import assert from 'node:assert/strict'
import { TerminalModel } from './terminal.model.js'
import { setSessionContext, updateTerminal, formatHudBannerFrame } from './buz/terminal.buzz.js'

test('SET_SESSION_CONTEXT updates shared fields and emits delimiter', async () => {
    const m = new TerminalModel() as any
    const consoles: string[] = []
    const ste: any = {
        hunt: async (type: string, bale: any) => {
            if (String(type).includes('Update Grid')) return { grdBit: { dat: {} } }
            if (String(type).includes('Update Console')) consoles.push(String(bale?.src))
            return {}
        },
    }
    await setSessionContext(m, { idx: 't', activePivotTitle: 'GOBLIN LORE MENU', activeSeriesSlug: 'wiregrass-basin', canonSealHash: '9f8e2a1b4c7d6e50', hostRigRole: 'RIG 1 (ORCHESTRATOR)' } as any, ste)
    assert.equal(m.activePivotTitle, 'GOBLIN LORE MENU')
    assert.equal(m.activeSeriesSlug, 'wiregrass-basin')
    assert.ok(consoles.some((c) => c.includes('[SESSION: GOBLIN LORE MENU]')))
})

test('HUD frame formats ACTIVE SESSION without clearing cns00', async () => {
    const m = new TerminalModel() as any
    m.activePivotTitle = 'CAULDRON MENU'
    const frame = formatHudBannerFrame(m)
    assert.ok(frame.includes('ACTIVE SESSION'))
    assert.ok(frame.includes('ACTIVE SERIES'))
    assert.ok(frame.includes('CANON STATUS'))
    assert.ok(frame.includes('HOST RIG'))
    for (const ch of frame) assert.ok(ch.charCodeAt(0) <= 127)
    const grids: any[] = []
    const ste: any = { hunt: async (t: string, b: any) => { if (String(t).includes('Update Grid')) grids.push(b); return {} } }
    await updateTerminal(m, { idx: 'u' } as any, ste)
    assert.deepEqual(grids[0], { x: 4, y: 0, xSpan: 8, ySpan: 3 })
    assert.ok(m.lastRenderedHudFrame.length > 0)
})
