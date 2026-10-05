import test from 'ava'
import { RepobotModel } from '../00.repobot.unit/repobot.model.js'
import * as Act from '../00.repobot.unit/repobot.action.js'
import { reducer } from '../00.repobot.unit/repobot.reduce.js'

test('RepobotModel initializes with valid default state', (t) => {
  const model = new RepobotModel()
  t.is(model.idx, '821.repobot')
  t.is(model.connectionState, 'DISCONNECTED')
  t.is(model.ws, null)
  t.is(model.reconnectTimer, null)
  t.is(model.reconnectAttempts, 0)
  t.is(model.maxReconnectDelayMs, 15000)
  t.is(model.lastSeqReceived, 0)
  t.true(model.activeBaseUrl.startsWith('http'))
})

test('Repobot actions define standardized ASCII type constants', (t) => {
  const connect = new Act.ConnectRepobot()
  t.is(connect.type, '[Repobot action] Connect Repobot')

  const disconnect = new Act.DisconnectRepobot()
  t.is(disconnect.type, '[Repobot action] Disconnect Repobot')

  const init = new Act.InitRepobot()
  t.is(init.type, '[Repobot action] Init Repobot')

  const update = new Act.UpdateRepobot()
  t.is(update.type, '[Repobot action] Update Repobot')
})

test('reducer transitions state to CONNECTING upon CONNECT_REPOBOT', async (t) => {
  const initial = new RepobotModel()
  const next = await reducer(initial, new Act.ConnectRepobot())
  t.is(next.connectionState, 'CONNECTING')
})

test('reducer transitions state to DISCONNECTED upon DISCONNECT_REPOBOT', async (t) => {
  const initial = new RepobotModel()
  initial.connectionState = 'CONNECTED'
  const next = await reducer(initial, new Act.DisconnectRepobot())
  t.is(next.connectionState, 'DISCONNECTED')
  t.is(next.reconnectAttempts, 0)
  t.is(next.ws, null)
})
