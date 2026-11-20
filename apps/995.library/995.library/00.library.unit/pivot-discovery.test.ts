import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { LibraryModel } from './library.model.js'
import { resolveFleetRoot, scanFleetPivots, hydratePivotModules } from './buz/pivot-discovery.buzz.js'

function makeTempWorkspace(): string {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'fleet-'))
    fs.mkdirSync(path.join(base, 'camp-candor-cauldron'))
    fs.mkdirSync(path.join(base, '01.canon'))
    return base
}

test('upward fleet root resolution locates workspace and falls back standalone', async () => {
    const ws = makeTempWorkspace()
    const nested = path.join(ws, '01.canon', 'nested')
    fs.mkdirSync(nested, { recursive: true })
    const cpy = new LibraryModel() as any
    await resolveFleetRoot(cpy, { startDir: nested }, null)
    assert.ok(cpy.fleetRoot.length > 0)
    const isolated = fs.mkdtempSync(path.join(os.tmpdir(), 'iso-'))
    const cpy2 = new LibraryModel() as any
    await resolveFleetRoot(cpy2, { startDir: isolated }, null)
    assert.equal(cpy2.isStandaloneMode, true)
    fs.rmSync(ws, { recursive: true, force: true })
    fs.rmSync(isolated, { recursive: true, force: true })
})

test('multi-cluster manifest sweep skips tombstone and LIBRARY', async () => {
    const prevCwd = process.cwd()
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'scan-'))
    const pkgs = path.join(tmp, 'packages')
    fs.mkdirSync(pkgs, { recursive: true })
    const good = path.join(pkgs, '001.test')
    fs.mkdirSync(good)
    fs.writeFileSync(
        path.join(good, 'package.json'),
        JSON.stringify({ name: '001.test', terminal: { globalKey: 'TESTMOD', menuTitle: 'TEST MENU', menuDesc: 'desc' } })
    )
    const bad = path.join(pkgs, '002.bad')
    fs.mkdirSync(bad)
    fs.writeFileSync(path.join(bad, 'package.json'), '{ malformed json')
    const tomb = path.join(pkgs, '003.tomb')
    fs.mkdirSync(tomb)
    fs.writeFileSync(path.join(tomb, '.tombstone'), '')
    fs.writeFileSync(path.join(tomb, 'package.json'), JSON.stringify({ name: 't', terminal: { globalKey: 'TOMB', menuTitle: 'TOMB MENU' } }))
    process.chdir(tmp)
    try {
        const cpy = new LibraryModel() as any
        cpy.fleetRoot = tmp
        cpy.isStandaloneMode = true
        await scanFleetPivots(cpy, {}, null)
        assert.ok(cpy.discoveredPivots.some((p: any) => p.terminal.globalKey === 'TESTMOD'))
        assert.ok(!cpy.discoveredPivots.some((p: any) => p.terminal.globalKey === 'TOMB'))
    } finally {
        process.chdir(prevCwd)
        fs.rmSync(tmp, { recursive: true, force: true })
    }
})

test('fail-closed hydration records SKIPPED_NO_BUILD without crash', async () => {
    const cpy = new LibraryModel() as any
    cpy.discoveredPivots = [
        {
            packageName: 'missing-pkg',
            packageDir: '/no/such/dir',
            clusterLabel: 'local',
            huntEntryPath: '/no/such/dir/hunt.js',
            terminal: { globalKey: 'MISSING', menuTitle: 'MISSING MENU', menuDesc: 'desc' },
        },
    ]
    await hydratePivotModules(cpy, {}, null)
    assert.equal(cpy.hydrationReceipts[0].status, 'SKIPPED_NO_BUILD')
})
