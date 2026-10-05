import { test, expect } from 'vitest'
import { RepobotModel } from '../00.repobot.unit/repobot.model.js'
import * as Act from '../00.repobot.unit/repobot.action.js'
import { reducer } from '../00.repobot.unit/repobot.reduce.js'

test('RepobotModel initializes with valid default state', () => {
    const model = new RepobotModel()
    expect(model.idx).toBe('821.repobot')
    expect(model.connectionState).toBe('DISCONNECTED')
    expect(model.ws).toBeNull()
    expect(model.reconnectTimer).toBeNull()
    expect(model.reconnectAttempts).toBe(0)
    expect(model.maxReconnectDelayMs).toBe(15000)
    expect(model.lastSeqReceived).toBe(0)
    expect(model.activeBaseUrl.startsWith('http')).toBe(true)
})

test('Repobot actions define standardized ASCII type constants', () => {
    const connect = new Act.ConnectRepobot()
    expect(connect.type).toBe('[Repobot action] Connect Repobot')

    const disconnect = new Act.DisconnectRepobot()
    expect(disconnect.type).toBe('[Repobot action] Disconnect Repobot')

    const init = new Act.InitRepobot()
    expect(init.type).toBe('[Repobot action] Init Repobot')

    const update = new Act.UpdateRepobot()
    expect(update.type).toBe('[Repobot action] Update Repobot')
})

test('reducer transitions state to CONNECTING upon CONNECT_REPOBOT', async () => {
    const initial = new RepobotModel()
    const next = await reducer(initial, new Act.ConnectRepobot())
    expect(next.connectionState).toBe('CONNECTING')
})

test('reducer transitions state to DISCONNECTED upon DISCONNECT_REPOBOT', async () => {
    const initial = new RepobotModel()
    initial.connectionState = 'CONNECTED'
    const next = await reducer(initial, new Act.DisconnectRepobot())
    expect(next.connectionState).toBe('DISCONNECTED')
    expect(next.reconnectAttempts).toBe(0)
    expect(next.ws).toBeNull()
})
