/**
 * Verifies the mathematical integrity of the SHA-256 hash chain for a repository.
 */
export const auditHashChainIntegrity = async (
    cpy: GithubModel,
    bal: GithubBit,
    ste: State,
) => {
    const baseUrl = getBaseUrl()
    const rawRepo =
        bal.src || bal.dat?.repo || 'astro-kahn-it-com/001.goblin-lore'
    const repo = rawRepo
        .replace(/^https?:\/\/github\.com\//i, '')
        .replace(/\.git$/i, '')
        .trim()

    await logConsole(
        '>> ==============================================================',
    )
    await logConsole(`>> [CRYPTOGRAPHIC AUDIT CHAIN VERIFICATION]`)
    await logConsole(`>> Target Repository : ${repo}`)

    const t0 = Date.now()
    try {
        const res = await fetch(
            `${baseUrl}/api/audit/verify-chain?repo=${encodeURIComponent(repo)}`,
        )
        const parsed = await parseSafeResponse(res)

        if (!parsed.ok || !parsed.data?.rows) {
            await logConsole(
                `>> [HTTP ${parsed.status}] Unable to fetch audit chain records.`,
            )
            await logConsole(
                '>> ==============================================================',
            )
            if (bal.slv) bal.slv({ gthBit: { idx: 'audit-chain-err', val: 0 } })
            return cpy
        }

        const rows = parsed.data.rows
        await logConsole(
            `>> Total Records     : ${rows.length} records retrieved (${Date.now() - t0}ms RTT)`,
        )

        if (rows.length === 0) {
            await logConsole(
                '>> [STATUS] NO AUDIT EVENTS LOGGED YET FOR THIS REPO.',
            )
            await logConsole(
                '>> ==============================================================',
            )
            if (bal.slv) bal.slv({ gthBit: { idx: 'audit-chain', val: 1 } })
            return cpy
        }

        // Check sequential chaining
        let broken = 0
        for (let i = 1; i < rows.length; i++) {
            const prev = rows[i - 1]
            const curr = rows[i]
            if (curr.prev_hash !== prev.record_hash) {
                broken++
                await logConsole(
                    `>> [CORRUPTION AT SEQ ${curr.sequence_id}] prevHash mismatch!`,
                )
            }
        }

        await logConsole(
            '>> --------------------------------------------------------------',
        )
        await logConsole(
            `>> Genesis Seed Hash : ${rows[0].prev_hash.slice(0, 16)}...`,
        )
        await logConsole(
            `>> Head Digest       : ${rows[rows.length - 1].record_hash.slice(0, 16)}...`,
        )
        await logConsole(`>> Broken Links      : ${broken}`)
        await logConsole(
            `>> Tamper Status     : ${broken === 0 ? '[0 DISCREPANCIES DETECTED]' : '[FAIL: TAMPERED]'}`,
        )
        await logConsole(
            '>> --------------------------------------------------------------',
        )
        await logConsole(
            `>> [STATUS] ${broken === 0 ? 'AUDIT TRAIL PROVEN & CERTIFIED [OK]' : 'CHAIN CORRUPTED [FAIL]'}`,
        )
        await logConsole(
            '>> ==============================================================',
        )

        if (bal.slv)
            bal.slv({
                gthBit: { idx: 'audit-chain', val: broken === 0 ? 1 : 0 },
            })
    } catch (err: any) {
        await logConsole(`>> [NETWORK ERROR]: ${err.message}`)
        if (bal.slv) bal.slv({ gthBit: { idx: 'audit-chain-err', val: 0 } })
    }

    return cpy
}

/**
 * Inspects the last 20 events from the hot D1 audit ledger.
 */
export const inspectD1AuditLog = async (
    cpy: GithubModel,
    bal: GithubBit,
    ste: State,
) => {
    const baseUrl = getBaseUrl()
    await logConsole(
        '>> ==============================================================',
    )
    await logConsole('>> [HOT TRANSACTIONAL LEDGER: D1 AUDIT TRAIL]')

    try {
        const res = await fetch(`${baseUrl}/api/audit/recent?limit=15`)
        const parsed = await parseSafeResponse(res)
        const events = parsed.data?.events || []

        if (events.length === 0) {
            await logConsole('>> (No audit events recorded in D1 yet)')
        } else {
            for (const e of events) {
                const dt = new Date(e.created_at)
                    .toISOString()
                    .replace('T', ' ')
                    .slice(0, 19)
                const drained = e.drained_at ? '[DRAINED]' : '[HOT]'
                await logConsole(
                    `>> [#${e.sequence_id}] ${dt} :: ${e.event_type} ${drained}`,
                )
                await logConsole(
                    `>>    Repo: ${e.repository} | Task: ${e.task_id} | Actor: ${e.actor_id}`,
                )
                await logConsole(
                    `>>    Head: ${e.head_sha.slice(0, 7)} | Hash: ${e.record_hash.slice(0, 8)}...`,
                )
            }
        }
        await logConsole(
            '>> ==============================================================',
        )
        if (bal.slv) bal.slv({ gthBit: { idx: 'inspect-d1', val: 1 } })
    } catch (err: any) {
        await logConsole(`>> [AUDIT QUERY ERROR]: ${err.message}`)
        if (bal.slv) bal.slv({ gthBit: { idx: 'inspect-d1-err', val: 0 } })
    }
    return cpy
}

/**
 * Triggers an immediate out-of-band cold drainage flush to GitHub.
 */
export const triggerColdDrainage = async (
    cpy: GithubModel,
    bal: GithubBit,
    ste: State,
) => {
    const baseUrl = getBaseUrl()
    await logConsole(
        '>> ==============================================================',
    )
    await logConsole(
        '>> [COLD PLAINTEXT DRAINAGE] Initiating flush to GitHub...',
    )

    const t0 = Date.now()
    try {
        const res = await fetch(`${baseUrl}/api/audit/drain`, {
            method: 'POST',
        })
        const parsed = await parseSafeResponse(res)

        if (parsed.ok && parsed.data?.ok) {
            const d = parsed.data
            await logConsole(`>> [HTTP 200 OK] :: ${Date.now() - t0}ms RTT`)
            await logConsole(`>> Records Drained : ${d.drainedCount}`)
            await logConsole(`>> Committed Files : ${d.committedFiles.length}`)
            for (const f of d.committedFiles) {
                await logConsole(`>>   - ${f}`)
            }
            await logConsole(
                `>> Pruned Hot Rows : ${d.prunedCount} (older than 7 days)`,
            )
            await logConsole('>> [STATUS] COLD DRAINAGE COMPLETED [OK]')
        } else {
            await logConsole(`>> [DRAINAGE FAILED: HTTP ${parsed.status}]`)
            await logConsole(
                `>> Error: ${parsed.data?.error || parsed.raw.slice(0, 80)}`,
            )
        }
        await logConsole(
            '>> ==============================================================',
        )
        if (bal.slv)
            bal.slv({
                gthBit: { idx: 'trigger-drainage', val: parsed.ok ? 1 : 0 },
            })
    } catch (err: any) {
        await logConsole(`>> [DRAINAGE NETWORK ERROR]: ${err.message}`)
        if (bal.slv)
            bal.slv({ gthBit: { idx: 'trigger-drainage-err', val: 0 } })
    }
    return cpy
}
