export default interface Repobot {
  idx: string
  ws: any
  connectionState: 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'RECONNECTING'
  reconnectTimer: any
  reconnectAttempts: number
  maxReconnectDelayMs: number
  lastSeqReceived: number
  activeBaseUrl: string
}
