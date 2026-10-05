import test from 'ava'
import sinon from 'sinon'
import { MenuModel } from '../98.menu.unit/menu.model.js'
import * as ActMnu from '../98.menu.unit/menu.action.js'
import * as ActRbt from '../00.repobot.unit/repobot.action.js'
import { initMenu, updateMenu } from '../98.menu.unit/buz/00.menu.buzz.js'

test('initMenu runs safely headlessly when LIBRARY is absent', async (t) => {
  delete (globalThis as any).LIBRARY
  delete (global as any).LIBRARY

  const model = new MenuModel()
  const slv = sinon.fake()
  const bal = { slv } as any

  const result = await initMenu(model, bal, {} as any)
  t.is(result.idx, '98.menu')
  t.true(slv.calledOnce)
})

test('updateMenu presents telemetry connect and disconnect options in Blessed mode', async (t) => {
  const huntFake = sinon.fake((action: string, bale: any) => {
    if (action === '[Grid action] Update Grid') {
      return Promise.resolve({ grdBit: { dat: { left: 0, top: 4 } } })
    }
    if (action === '[Open action] Open Choice') {
      t.true(bale.lst.includes('CONNECT REPOBOT TELEMETRY'))
      t.true(bale.lst.includes('DISCONNECT REPOBOT TELEMETRY'))
      t.true(bale.lst.includes('INSPECT TELEMETRY STATUS'))
      t.true(bale.lst.includes('ROOT MENU'))
      return Promise.resolve({ chcBit: { src: 'ROOT MENU' } })
    }
    return Promise.resolve({})
  })

  ;(globalThis as any).LIBRARY = { hunt: huntFake }

  const model = new MenuModel()
  const slv = sinon.fake()
  const ste = {
    value: {
      repobot: {
        connectionState: 'DISCONNECTED',
        lastSeqReceived: 0,
      },
    },
    hunt: sinon.fake.resolves({}),
  } as any

  await updateMenu(model, { slv }, ste)
  t.true(huntFake.called)
  delete (globalThis as any).LIBRARY
})

test('selecting CONNECT REPOBOT TELEMETRY dispatches ActRbt.CONNECT_REPOBOT', async (t) => {
  const huntFake = sinon.fake((action: string) => {
    if (action === '[Grid action] Update Grid') {
      return Promise.resolve({ grdBit: { dat: {} } })
    }
    if (action === '[Open action] Open Choice') {
      return Promise.resolve({ chcBit: { src: 'CONNECT REPOBOT TELEMETRY' } })
    }
    return Promise.resolve({})
  })

  ;(globalThis as any).LIBRARY = { hunt: huntFake }

  const model = new MenuModel()
  const steHunt = sinon.fake.resolves({})
  const ste = {
    value: { repobot: { connectionState: 'DISCONNECTED' } },
    hunt: steHunt,
  } as any

  await updateMenu(model, {}, ste)

  t.true(steHunt.calledWith(ActRbt.CONNECT_REPOBOT, {}))
  delete (globalThis as any).LIBRARY
})
