// Shared configuration for all Audit tests
const isLocalRun = process.env.npm_lifecycle_event?.includes('local')
import 'dotenv/config'

export const TARGET_URL =
    (isLocalRun ? 'http://127.0.0.1:8787' : null) ||
    process.env.STAGING_URL ||
    'http://127.0.0.1:8787'

export const USER_AGENT = 'Gillian-Auditor/1.0'

// Helper to generate unique IDs for audits so they don't collide
export const getAuditId = (prefix: string) =>
    `${prefix}_${isLocalRun ? 'local' : 'live'}_${Date.now()}`
