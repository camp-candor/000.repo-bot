import { appendAuditEvent } from './audit/auditLedger.js'
import { executeColdDrainage } from './audit/drainageEngine.js'

// Inside handleGitHubWebhook, record the audit entry on pull_request events:
if (event === 'pull_request' && payload.action) {
    c.executionCtx.waitUntil(
        appendAuditEvent(c.env.DB, {
            taskId:
                payload.pull_request?.head?.ref ||
                `PR-${payload.pull_request?.number}`,
            repository: payload.repository?.full_name || 'unknown',
            eventType: `PR_${payload.action.toUpperCase()}`,
            actorId: payload.sender?.login || 'unknown',
            headSha: payload.pull_request?.head?.sha || 'unknown',
            payload: {
                action: payload.action,
                number: payload.pull_request?.number,
                title: payload.pull_request?.title,
                merged: payload.pull_request?.merged || false,
            },
        }).catch((err) => console.error('[AUDIT_LEDGER_ERROR]', err)),
    )
}

// -----------------------------------------------------------------------------
// AUDIT LEDGER & DRAINAGE ROUTES
// -----------------------------------------------------------------------------

// Query recent events from D1
app.get('/api/audit/recent', async (c) => {
    const limit = Math.min(Number(c.req.query('limit')) || 20, 100)
    const repo = c.req.query('repo')

    let query = 'SELECT * FROM audit_events '
    const params: any[] = []
    if (repo) {
        query += 'WHERE repository = ? '
        params.push(repo)
    }
    query += 'ORDER BY sequence_id DESC LIMIT ?'
    params.push(limit)

    const { results } = await c.env.DB.prepare(query)
        .bind(...params)
        .all()
    return c.json({ ok: true, events: results || [] })
})

// Verify hash chain integrity across a sequence range
app.get('/api/audit/verify-chain', async (c) => {
    const repo = c.req.query('repo')
    if (!repo) {
        return c.json(
            { ok: false, error: 'Repository query param required' },
            400,
        )
    }

    const { results } = await c.env.DB.prepare(
        'SELECT * FROM audit_events WHERE repository = ? ORDER BY sequence_id ASC',
    )
        .bind(repo)
        .all()

    const rows = results || []
    return c.json({ ok: true, count: rows.length, rows })
})

// Trigger manual cold drainage flush
app.post('/api/audit/drain', async (c) => {
    try {
        const result = await executeColdDrainage(c.env.DB, {
            GITHUB_TOKEN: c.env.GITHUB_TOKEN,
            ARCHIVE_REPO: c.env.ARCHIVE_REPO,
        })
        return c.json({ ok: true, ...result })
    } catch (err: any) {
        return c.json({ ok: false, error: err.message }, 500)
    }
})

// -----------------------------------------------------------------------------
// CLOUDFLARE CRON TRIGGER SCHEDULED HANDLER
// -----------------------------------------------------------------------------
export default {
    fetch: app.fetch,
    async scheduled(event: ScheduledEvent, env: any, ctx: ExecutionContext) {
        ctx.waitUntil(
            executeColdDrainage(env.DB, {
                GITHUB_TOKEN: env.GITHUB_TOKEN,
                ARCHIVE_REPO: env.ARCHIVE_REPO,
            }).catch((err) =>
                console.error('[SCHEDULED_DRAINAGE_FAILED]', err),
            ),
        )
    },
}
