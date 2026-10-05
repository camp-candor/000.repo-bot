import type { RepobotModel } from '../repobot.model.js'
import type RepobotBit from '../fce/repobot.bit.js'
import type State from '../../99.core/state.js'

export const initRepobot = (
  cpy: RepobotModel,
  bal?: RepobotBit,
  _ste?: State,
): RepobotModel => {
  if (bal?.slv) bal.slv({ rbtBit: { idx: 'init-repobot', val: 1 } })
  return cpy
}

export const updateRepobot = (
  cpy: RepobotModel,
  bal?: RepobotBit,
  _ste?: State,
): RepobotModel => {
  if (bal?.slv) bal.slv({ rbtBit: { idx: 'update-repobot', val: 1 } })
  return cpy
}

export const connectRepobot = async (
  cpy: RepobotModel,
  bal?: RepobotBit,
  _ste?: State,
): Promise<RepobotModel> => {
  cpy.connectionState = 'CONNECTING'
  if (bal?.slv) bal.slv({ rbtBit: { idx: 'connect-repobot', val: 1 } })
  return cpy
}

export const disconnectRepobot = async (
  cpy: RepobotModel,
  bal?: RepobotBit,
  _ste?: State,
): Promise<RepobotModel> => {
  if (cpy.reconnectTimer) {
    clearTimeout(cpy.reconnectTimer)
    cpy.reconnectTimer = null
  }
  cpy.connectionState = 'DISCONNECTED'
  cpy.reconnectAttempts = 0
  if (cpy.ws) {
    try {
      cpy.ws.close(1000, 'Disconnect requested')
    } catch {}
    cpy.ws = null
  }
  if (bal?.slv) bal.slv({ rbtBit: { idx: 'disconnect-repobot', val: 1 } })
  return cpy
}
