import type Repobot from './fce/repobot.interface.js'

export class RepobotModel implements Repobot {
  idx = '821.repobot'
  ws: any = null
  connectionState:
    'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'RECONNECTING' =
    'DISCONNECTED'
  reconnectTimer: any = null
  reconnectAttempts = 0
  maxReconnectDelayMs = 15000
  lastSeqReceived = 0
  activeBaseUrl = 'https://repo-bot-00.berad4000.workers.dev'
}
