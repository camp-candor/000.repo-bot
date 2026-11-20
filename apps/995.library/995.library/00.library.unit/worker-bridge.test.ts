import test from 'node:test'
import assert from 'node:assert/strict'
import { LibraryModel } from './library.model.js'
import { checkWorkerBridge, toggleWorkerBridge } from './buz/worker-bridge.buzz.js'

test('checkWorkerBridge reports PARITY_VERIFIED when fetch resolves', async () => {
    const origFetch = (globalThis as any).fetch
    ;(globalThis as any).fetch = async () => ({ ok: true, json: async () => ({ routes: [{ globalKey: 'LIBRARY' }] }) })
    try {
        const m = new LibraryModel() as any
        m.workerBridgeEnabled = true
        await checkWorkerBridge(m, {}, null)
        assert.equal(m.lastWorkerBridgeReceipt.reachable, true)
        assert.equal(m.lastWorkerBridgeReceipt.statusMessage, 'PARITY_VERIFIED')
    } finally { (globalThis as any).fetch = origFetch }
})

test('checkWorkerBridge degrades offline gracefully', async () => {
    const origFetch = (globalThis as any).fetch
    ;(globalThis as any).fetch = async () => { throw new Error('down') }
    try {
        const m = new LibraryModel() as any
        m.workerBridgeEnabled = true
        await checkWorkerBridge(m, { timeoutMs: 50 }, null)
        assert.equal(m.lastWorkerBridgeReceipt.reachable, false)
    } finally { (globalThis as any).fetch = origFetch }
})

test('toggleWorkerBridge flips flag headless', async () => {
    const origFetch = (globalThis as any).fetch
    ;(globalThis as any).fetch = async () => { throw new Error('down') }
    try {
        const m = new LibraryModel() as any
        const before = m.workerBridgeEnabled
        await toggleWorkerBridge(m, {}, null)
        assert.equal(m.workerBridgeEnabled, !before)
    } finally { (globalThis as any).fetch = origFetch }
})
