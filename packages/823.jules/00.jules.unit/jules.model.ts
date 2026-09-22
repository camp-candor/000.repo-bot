import type Jules from './fce/jules.interface.js'

export class JulesModel implements Jules {
    idx: string = '823.jules'
    activeSessions: Record<string, any> = {}
    lastDispatchedSessionId: string | null = null
}
