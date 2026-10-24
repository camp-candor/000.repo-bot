import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'

let envLoaded = false

/**
 * Ascends the directory tree from process.cwd() to locate the monorepo root .env file.
 */
export const resolveRootEnv = (): string | null => {
    let curr = process.cwd()
    while (curr && curr !== path.dirname(curr)) {
        const candidate = path.join(curr, '.env')
        if (fs.existsSync(candidate)) {
            return candidate
        }
        curr = path.dirname(curr)
    }
    return null
}

const ensureEnv = () => {
    if (envLoaded) return
    const rootEnv = resolveRootEnv()
    if (rootEnv) {
        dotenv.config({ path: rootEnv })
    } else {
        dotenv.config()
    }
    envLoaded = true
}

/**
 * Resolves the outbound HTTP base URL across the 4-Tier Precedence Cascade:
 *   Tier 1: (global as any).agentBaseUrl (Active local/live switchboard pointer)
 *   Tier 2: (global as any).packageBaseUrl (Domain package override)
 *   Tier 3: process.env.LIVE_WORKER_URL || process.env.WORKER_URL (Environment bindings)
 *   Tier 4: Default loopback fallback ('http://127.0.0.1:8787')
 *
 * Enforces trailing-slash sanitization per invocation.
 */
export const getBaseUrl = (): string => {
    ensureEnv()

    const raw =
        (global as any).agentBaseUrl ||
        (global as any).packageBaseUrl ||
        process.env.LIVE_WORKER_URL ||
        process.env.WORKER_URL ||
        'http://127.0.0.1:8787'

    return String(raw).trim().replace(/\/+$/, '')
}

/**
 * Synchronously derives the corresponding WebSocket URL from the active base HTTP URL:
 *   http://  -> ws://
 *   https:// -> wss://
 */
export const getBaseWsUrl = (): string => {
    const httpUrl = getBaseUrl()
    if (httpUrl.startsWith('https://')) {
        return httpUrl.replace(/^https:\/\//, 'wss://')
    }
    return httpUrl.replace(/^http:\/\//, 'ws://')
}
