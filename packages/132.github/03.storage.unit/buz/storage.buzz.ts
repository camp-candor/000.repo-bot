import { StorageModel } from '../storage.model.js'
import StorageBit from '../fce/storage.bit.js'
import State from '../../99.core/state.js'

const UPDATE_CONSOLE = '[Console action] Update Console'

export const logConsole = async (src: string, maxLen = 56) => {
    if (!(global as any).LIBRARY) return

    if (
        src.length <= maxLen ||
        src.startsWith('>> ===') ||
        src.startsWith('>> ---')
    ) {
        await (global as any).LIBRARY.hunt(UPDATE_CONSOLE, {
            idx: 'cns00',
            src,
        })
        return
    }

    const words = src.split(' ')
    let currentLine = ''

    for (const word of words) {
        if ((currentLine + ' ' + word).length > maxLen) {
            await (global as any).LIBRARY.hunt(UPDATE_CONSOLE, {
                idx: 'cns00',
                src: currentLine,
            })
            currentLine = '>>    ' + word
        } else {
            currentLine = currentLine ? `${currentLine} ${word}` : word
        }
    }
    if (currentLine) {
        await (global as any).LIBRARY.hunt(UPDATE_CONSOLE, {
            idx: 'cns00',
            src: currentLine,
        })
    }
}

const getBaseUrl = (): string => {
    return (
        (global as any).githubBaseUrl ||
        process.env.LIVE_WORKER_URL ||
        process.env.WORKER_URL ||
        'https://repo-bot-00.berad4000.workers.dev'
    ).replace(/\/$/, '')
}

export const initStorage = (cpy: StorageModel, bal: StorageBit, ste: State) => {
    if (bal.slv) bal.slv({ strBit: { idx: 'init-storage' } })
    return cpy
}

export const updateStorage = (
    cpy: StorageModel,
    bal: StorageBit,
    ste: State,
) => {
    if (bal.slv) bal.slv({ strBit: { idx: 'update-storage' } })
    return cpy
}

/**
 * Queries edge worker to inspect cold storage synchronization status and buffer volume.
 */
export const checkDrainageStatus = async (
    cpy: StorageModel,
    bal: StorageBit,
    ste: State,
) => {
    const baseUrl = getBaseUrl()
    await logConsole(
        '>> ==============================================================',
    )
    await logConsole('>> [COLD STORAGE STATUS & SYNC TELEMETRY]')

    const t0 = Date.now()
    try {
        const res = await fetch(`${baseUrl}/api/audit/status`)
        const data: any = await res.json()
        const rtt = Date.now() - t0

        if (res.ok && data.ok) {
            await logConsole(`>> [HTTP 200 OK] :: ${rtt}ms RTT`)
            await logConsole(`>> Cron Cadence      : ${data.cronSchedule}`)

            if (data.lastDrainedAt) {
                const drainedDate = new Date(data.lastDrainedAt)
                const elapsedMin = Math.round(
                    ((data.serverTime || Date.now()) - data.lastDrainedAt) /
                        60000,
                )
                await logConsole(
                    `>> Last Drainage     : ${drainedDate.toISOString().replace('T', ' ').slice(0, 19)} UTC`,
                )
                await logConsole(
                    `>> Elapsed Since Sync: ${elapsedMin} minutes ago`,
                )
            } else {
                await logConsole(
                    '>> Last Drainage     : (No records drained yet - all events hot)',
                )
            }

            await logConsole(
                '>> --------------------------------------------------------------',
            )
            await logConsole(
                `>> Undrained Hot Rows: ${data.undrainedCount} / 1000 (Buffer capacity)`,
            )
            await logConsole(`>> Total Hot Rows    : ${data.totalHotRecords}`)

            if (data.lastRecord) {
                await logConsole(
                    `>> Latest Sequence   : #${data.lastRecord.sequence_id} (${data.lastRecord.repository})`,
                )
                await logConsole(
                    `>> Latest Digest     : ${data.lastRecord.record_hash.slice(0, 16)}...`,
                )
            }
            await logConsole(
                '>> ==============================================================',
            )

            if (bal.slv)
                bal.slv({
                    strBit: { idx: 'check-drainage-status', val: 1, dat: data },
                })
        } else {
            await logConsole(`>> [QUERY FAILED: HTTP ${res.status}]`)
            if (bal.slv)
                bal.slv({
                    strBit: { idx: 'check-drainage-status-err', val: 0 },
                })
        }
    } catch (err: any) {
        await logConsole(`>> [STORAGE NETWORK ERROR]: ${err.message}`)
        if (bal.slv)
            bal.slv({ strBit: { idx: 'check-drainage-status-err', val: 0 } })
    }
    return cpy
}

/**
 * Calculates countdown remaining until next midnight UTC scheduled cold drainage.
 */
export const countdownDrainage = async (
    cpy: StorageModel,
    bal: StorageBit,
    ste: State,
) => {
    const now = new Date()
    const nextMidnightUtc = new Date(
        Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate() + 1,
            0,
            0,
            0,
        ),
    )
    const diffMs = nextMidnightUtc.getTime() - now.getTime()

    const hours = Math.floor(diffMs / (1000 * 60 * 60))
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
    const seconds = Math.floor((diffMs % (1000 * 60)) / 1000)

    await logConsole(
        '>> ==============================================================',
    )
    await logConsole('>> [COLD DRAINAGE COUNTDOWN TIMER]')
    await logConsole(
        `>> Current Time UTC   : ${now.toISOString().replace('T', ' ').slice(0, 19)} UTC`,
    )
    await logConsole(
        `>> Next Scheduled Sync: ${nextMidnightUtc.toISOString().replace('T', ' ').slice(0, 19)} UTC`,
    )
    await logConsole(
        '>> --------------------------------------------------------------',
    )
    await logConsole(
        `>> COUNTDOWN REMAINING: ${hours}h ${minutes}m ${seconds}s`,
    )
    await logConsole(
        '>> --------------------------------------------------------------',
    )
    await logConsole(
        '>> Trigger Policy     : 00:00 UTC Cron OR 1,000 Hot Records Overflow',
    )
    await logConsole(
        '>> Target Sink        : camp-candor/000.repo-bot [audit-log branch]',
    )
    await logConsole(
        '>> ==============================================================',
    )

    if (bal.slv)
        bal.slv({
            strBit: {
                idx: 'countdown-drainage',
                val: 1,
                dat: { hours, minutes, seconds, diffMs },
            },
        })
    return cpy
}

/**
 * Fetches recent records from D1 storage (up to 100).
 */
export const fetchStorageRecords = async (
    cpy: StorageModel,
    bal: StorageBit,
    ste: State,
) => {
    const baseUrl = getBaseUrl()
    const limit = bal.val || 100
    const undrainedParam = bal.src === 'undrained' ? '&undrained=true' : ''

    try {
        const res = await fetch(
            `${baseUrl}/api/audit/recent?limit=${limit}${undrainedParam}`,
        )
        const data: any = await res.json()
        const records = data.events || []

        if (bal.slv)
            bal.slv({
                strBit: { idx: 'fetch-storage-records', lst: records, val: 1 },
            })
    } catch (err: any) {
        await logConsole(`>> [FETCH STORAGE ERROR]: ${err.message}`)
        if (bal.slv)
            bal.slv({
                strBit: { idx: 'fetch-storage-records-err', lst: [], val: 0 },
            })
    }
    return cpy
}

/**
 * Displays full forensic breakdown for a single selected audit record.
 */
export const inspectStorageRecord = async (
    cpy: StorageModel,
    bal: StorageBit,
    ste: State,
) => {
    const record = bal.dat
    if (!record) {
        await logConsole('>> [ERROR] No record payload provided to inspect.')
        if (bal.slv)
            bal.slv({ strBit: { idx: 'inspect-storage-record-err', val: 0 } })
        return cpy
    }

    let payload: any = {}
    try {
        payload = JSON.parse(record.payload_json)
    } catch {
        payload = record.payload_json
    }

    const dt = new Date(record.created_at)
        .toISOString()
        .replace('T', ' ')
        .slice(0, 19)
    const commitMsg =
        payload.title ||
        payload.message ||
        payload.commit?.message ||
        '(No commit message attached)'
    const isDrained = Boolean(record.drained_at)

    await logConsole(
        '>> ==============================================================',
    )
    await logConsole(
        `>> [FORENSIC RECORD INSPECTION :: SEQUENCE #${record.sequence_id}]`,
    )
    await logConsole(`>> Timestamp     : ${dt} UTC`)
    await logConsole(`>> Repository    : ${record.repository}`)
    await logConsole(`>> Task ID       : ${record.task_id}`)
    await logConsole(`>> Event Type    : ${record.event_type}`)
    await logConsole(`>> Actor         : ${record.actor_id}`)
    await logConsole(`>> Head SHA      : ${record.head_sha}`)
    await logConsole(
        `>> Storage State : ${isDrained ? '[COLD DRAINED]' : '[HOT BUFFER IN D1]'}`,
    )
    if (isDrained) {
        const drainedDt = new Date(record.drained_at)
            .toISOString()
            .replace('T', ' ')
            .slice(0, 19)
        await logConsole(`>> Drained At    : ${drainedDt} UTC`)
    }
    await logConsole(
        '>> --------------------------------------------------------------',
    )
    await logConsole(`>> Commit Message: "${commitMsg.split('\n')[0]}"`)
    await logConsole(
        '>> --------------------------------------------------------------',
    )
    await logConsole('>> [CRYPTOGRAPHIC PROVENANCE LINKAGE]')
    await logConsole(`>> Previous Hash : ${record.prev_hash}`)
    await logConsole(`>> Record Hash   : ${record.record_hash}`)
    await logConsole(
        '>> --------------------------------------------------------------',
    )
    await logConsole('>> [NORMALIZED JCS PAYLOAD]')
    const prettyJson = JSON.stringify(payload, null, 2)
    for (const line of prettyJson.split('\n').slice(0, 12)) {
        await logConsole(`>>   ${line}`)
    }
    if (prettyJson.split('\n').length > 12) {
        await logConsole('>>   ... (truncated for terminal display)')
    }
    await logConsole(
        '>> ==============================================================',
    )

    if (bal.slv) bal.slv({ strBit: { idx: 'inspect-storage-record', val: 1 } })
    return cpy
}
