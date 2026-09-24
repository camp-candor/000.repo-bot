import { StoredAuditEvent } from './auditLedger.js'

interface DrainResult {
    drainedCount: number
    committedFiles: string[]
    prunedCount: number
}

/**
 * Formats a batch of records into an .ndjson string.
 */
export function formatNdjsonBatch(records: StoredAuditEvent[]): string {
    return (
        records
            .map((r) => {
                return JSON.stringify({
                    seq: r.sequence_id,
                    ts: r.created_at,
                    repo: r.repository,
                    task: r.task_id,
                    type: r.event_type,
                    actor: r.actor_id,
                    headSha: r.head_sha,
                    prevHash: r.prev_hash,
                    hash: r.record_hash,
                    payload: JSON.parse(r.payload_json),
                })
            })
            .join('\n') + '\n'
    )
}

/**
 * Commits a file to the GitHub audit-log orphan branch via the Contents API.
 */
async function commitToGitHubAuditLog(
    ghToken: string,
    archiveRepo: string,
    filePath: string,
    content: string,
    message: string,
): Promise<void> {
    const url = `[https://api.github.com/repos/$](https://api.github.com/repos/$){archiveRepo}/contents/${filePath}`
    const headers = {
        'Authorization': `token ${ghToken}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'Repo-Bot-Audit-Drainage',
        'Content-Type': 'application/json',
    }

    // Check if the file already exists on the audit-log branch to obtain its SHA
    let existingSha: string | undefined
    const getRes = await fetch(`${url}?ref=audit-log`, { headers })
    if (getRes.ok) {
        const fileInfo: any = await getRes.json()
        existingSha = fileInfo.sha
    }

    // Convert payload to Base64 using standard Web APIs
    const base64Content = btoa(unescape(encodeURIComponent(content)))

    const putRes = await fetch(url, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
            message,
            content: base64Content,
            branch: 'audit-log',
            sha: existingSha,
        }),
    })

    if (!putRes.ok) {
        const errText = await putRes.text()
        throw new Error(
            `GitHub Contents API error (HTTP ${putRes.status}): ${errText}`,
        )
    }
}

/**
 * Executes cold drainage: dumps undrained D1 records to GitHub and prunes old entries.
 */
export async function executeColdDrainage(
    db: any,
    env: { GITHUB_TOKEN: string; ARCHIVE_REPO?: string },
): Promise<DrainResult> {
    const archiveRepo = env.ARCHIVE_REPO || 'camp-candor/000.repo-bot'
    const ghToken = env.GITHUB_TOKEN

    if (!ghToken) {
        throw new Error(
            'GITHUB_TOKEN missing from environment. Cold drainage aborted.',
        )
    }

    // 1. Fetch undrained records (up to 1,000)
    const { results } = await db
        .prepare(
            'SELECT * FROM audit_events WHERE drained_at IS NULL ORDER BY sequence_id ASC LIMIT 1000',
        )
        .all()

    const records = (results || []) as StoredAuditEvent[]
    if (records.length === 0) {
        return { drainedCount: 0, committedFiles: [], prunedCount: 0 }
    }

    // 2. Group records by date (YYYY/MM/DD) and repository
    const groups = new Map<string, StoredAuditEvent[]>()
    for (const rec of records) {
        const d = new Date(rec.created_at)
        const yyyy = d.getUTCFullYear()
        const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
        const dd = String(d.getUTCDate()).padStart(2, '0')
        const safeSlug = rec.repository.replace(/[^a-zA-Z0-9_-]/g, '_')
        const key = `audit/${yyyy}/${mm}/${dd}/${safeSlug}.ndjson`

        if (!groups.has(key)) groups.set(key, [])
        groups.get(key)!.push(rec)
    }

    const committedFiles: string[] = []

    // 3. Commit each file to the audit-log branch
    for (const [filePath, batch] of groups.entries()) {
        const ndjsonPayload = formatNdjsonBatch(batch)
        const minSeq = batch[0].sequence_id
        const maxSeq = batch[batch.length - 1].sequence_id
        const commitMsg = `chore(audit): drain events ${minSeq} -> ${maxSeq} for ${batch[0].repository}`

        await commitToGitHubAuditLog(
            ghToken,
            archiveRepo,
            filePath,
            ndjsonPayload,
            commitMsg,
        )
        committedFiles.push(filePath)
    }

    // 4. Mark records as drained in D1
    const maxSeqDrained = records[records.length - 1].sequence_id
    await db
        .prepare(
            'UPDATE audit_events SET drained_at = ? WHERE sequence_id <= ? AND drained_at IS NULL',
        )
        .bind(Date.now(), maxSeqDrained)
        .run()

    // 5. Prune drained records older than 7 days
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
    const pruneResult = await db
        .prepare(
            'DELETE FROM audit_events WHERE drained_at IS NOT NULL AND created_at < ?',
        )
        .bind(sevenDaysAgo)
        .run()

    return {
        drainedCount: records.length,
        committedFiles,
        prunedCount: pruneResult?.meta?.changes || 0,
    }
}
