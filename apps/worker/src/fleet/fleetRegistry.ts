import type { D1DatabaseInterface } from '../db/d1Ledger.js'

export interface FleetRegistrationPayload {
    workerId: string
    hostname: string
    gpuModel: string
    vramTotalMb: number
    vramFreeMb?: number
}

export interface FleetWorkerRecord {
    workerId: string
    hostname: string
    gpuModel: string
    vramTotalMb: number
    vramFreeMb: number
    status: 'ONLINE' | 'BUSY' | 'OFFLINE'
    activeTaskId: string | null
    registeredAtMs: number
    lastHeartbeatMs: number
}

export class FleetRegistry {
    constructor(private db: D1DatabaseInterface) {}

    /**
     * Ingests and registers physical GPU runner hardware into the fleet table.
     */
    public async registerWorker(
        payload: FleetRegistrationPayload,
    ): Promise<void> {
        if (!payload.workerId || !payload.hostname || !payload.gpuModel) {
            throw new Error(
                'FLEET_REGISTER_ERROR: Missing required registration fields.',
            )
        }

        if (
            typeof payload.vramTotalMb !== 'number' ||
            payload.vramTotalMb <= 0
        ) {
            throw new Error(
                'FLEET_REGISTER_ERROR: vramTotalMb must be a positive integer.',
            )
        }

        const now = Date.now()
        const vramFree = payload.vramFreeMb ?? payload.vramTotalMb

        const query = `
            INSERT INTO fleet_workers (
                worker_id, hostname, gpu_model, vram_total_mb, vram_free_mb,
                status, active_task_id, registered_at_ms, last_heartbeat_ms
            ) VALUES (?, ?, ?, ?, ?, 'ONLINE', NULL, ?, ?)
            ON CONFLICT(worker_id) DO UPDATE SET
                hostname = excluded.hostname,
                gpu_model = excluded.gpu_model,
                vram_total_mb = excluded.vram_total_mb,
                vram_free_mb = excluded.vram_free_mb,
                status = 'ONLINE',
                last_heartbeat_ms = excluded.last_heartbeat_ms;
        `

        await this.db
            .prepare(query)
            .bind(
                payload.workerId,
                payload.hostname,
                payload.gpuModel,
                payload.vramTotalMb,
                vramFree,
                now,
                now,
            )
            .run()

        console.log(
            `>> [FLEET:REGISTER] Registered hardware '${payload.workerId}' (${payload.gpuModel}, ${payload.vramTotalMb}MB) [OK]`,
        )
    }

    /**
     * Updates runner heartbeat telemetry and toggles status between ONLINE and BUSY.
     */
    public async recordHeartbeat(
        workerId: string,
        vramFreeMb: number,
        activeTaskId?: string | null,
    ): Promise<boolean> {
        const now = Date.now()
        const newStatus = activeTaskId ? 'BUSY' : 'ONLINE'

        const query = `
            UPDATE fleet_workers
            SET vram_free_mb = ?,
                active_task_id = ?,
                status = ?,
                last_heartbeat_ms = ?
            WHERE worker_id = ?;
        `

        const res = await this.db
            .prepare(query)
            .bind(vramFreeMb, activeTaskId ?? null, newStatus, now, workerId)
            .run()

        return res.success
    }

    /**
     * Detects stale runners exceeding timeout threshold and transitions them to OFFLINE.
     */
    public async reapStaleWorkers(timeoutMs = 60_000): Promise<string[]> {
        const threshold = Date.now() - timeoutMs

        const selectQuery = `
            SELECT worker_id FROM fleet_workers
            WHERE status != 'OFFLINE' AND last_heartbeat_ms < ?;
        `

        const staleList = await this.db
            .prepare(selectQuery)
            .bind(threshold)
            .all<{ worker_id: string }>()
        const staleIds = (staleList.results || []).map((r) => r.worker_id)

        if (staleIds.length === 0) {
            return []
        }

        const updateQuery = `
            UPDATE fleet_workers
            SET status = 'OFFLINE',
                active_task_id = NULL
            WHERE status != 'OFFLINE' AND last_heartbeat_ms < ?;
        `

        await this.db.prepare(updateQuery).bind(threshold).run()

        for (const id of staleIds) {
            console.warn(
                `>> [FLEET:STALE] Evicted stale worker '${id}' due to heartbeat timeout [OFFLINE]`,
            )
        }

        return staleIds
    }

    /**
     * Returns all available (ONLINE) fleet workers with sufficient free VRAM.
     */
    public async getEligibleWorkers(
        minVramMb = 0,
    ): Promise<FleetWorkerRecord[]> {
        const query = `
            SELECT worker_id, hostname, gpu_model, vram_total_mb, vram_free_mb,
                   status, active_task_id, registered_at_ms, last_heartbeat_ms
            FROM fleet_workers
            WHERE status = 'ONLINE' AND vram_free_mb >= ?
            ORDER BY vram_free_mb DESC;
        `

        const res = await this.db.prepare(query).bind(minVramMb).all<any>()
        if (!res.results) return []

        return res.results.map((r) => ({
            workerId: r.worker_id,
            hostname: r.hostname,
            gpuModel: r.gpu_model,
            vramTotalMb: Number(r.vram_total_mb),
            vramFreeMb: Number(r.vram_free_mb),
            status: r.status,
            activeTaskId: r.active_task_id,
            registeredAtMs: Number(r.registered_at_ms),
            lastHeartbeatMs: Number(r.last_heartbeat_ms),
        }))
    }
}
