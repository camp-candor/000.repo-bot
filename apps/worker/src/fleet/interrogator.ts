export interface InterrogationReport {
    workerId: string
    reachable: boolean
    latencyMs: number
    vramFreeMb: number
    vramTotalMb: number
    activeNode: string
    queueDepth: number
    error?: string
    probedAtMs: number
}

export interface ComfySystemStatsPayload {
    system?: {
        vram_free?: number
        vram_total?: number
        devices?: Array<{
            vram_free?: number
            vram_total?: number
            name?: string
        }>
    }
    exec_info?: {
        queue_remaining?: number
    }
    active_node?: string
}

export const DEFAULT_PROBE_TIMEOUT_MS = 3000

export class RemoteRunnerInterrogator {
    /**
     * Interrogates remote GPU runner via ComfyUI / system daemon endpoint.
     * Enforces strict timeout and non-blocking failure semantics.
     */
    public async interrogateRunner(
        endpointUrl: string,
        workerId: string,
        timeoutMs = DEFAULT_PROBE_TIMEOUT_MS,
    ): Promise<InterrogationReport> {
        const probedAtMs = Date.now()
        const controller = new AbortController()
        const timeoutTimer = setTimeout(() => controller.abort(), timeoutMs)

        const startTime = Date.now()
        const cleanUrl = endpointUrl.replace(/\/+$/, '')
        const targetUrl = `${cleanUrl}/system_stats`

        try {
            const response = await fetch(targetUrl, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': '000.repo-bot-interrogator',
                },
                signal: controller.signal,
            })

            clearTimeout(timeoutTimer)
            const latencyMs = Math.max(1, Date.now() - startTime)

            if (!response.ok) {
                console.warn(
                    `>> [INTERROGATE:WARN] Runner '${workerId}' returned HTTP ${response.status}`,
                )
                return {
                    workerId,
                    reachable: false,
                    latencyMs,
                    vramFreeMb: 0,
                    vramTotalMb: 0,
                    activeNode: 'UNAVAILABLE',
                    queueDepth: 0,
                    error: `HTTP_${response.status}`,
                    probedAtMs,
                }
            }

            const data = (await response
                .json()
                .catch(() => ({}))) as ComfySystemStatsPayload

            // Extract VRAM from devices array or fallback fields
            let vramFree = 0
            let vramTotal = 0

            if (data.system?.devices && data.system.devices.length > 0) {
                const primaryDevice = data.system.devices[0]
                vramFree = Math.round(
                    (primaryDevice.vram_free || 0) / (1024 * 1024),
                )
                vramTotal = Math.round(
                    (primaryDevice.vram_total || 0) / (1024 * 1024),
                )
            } else if (data.system) {
                vramFree = Math.round(
                    (data.system.vram_free || 0) / (1024 * 1024),
                )
                vramTotal = Math.round(
                    (data.system.vram_total || 0) / (1024 * 1024),
                )
            }

            const queueDepth = data.exec_info?.queue_remaining ?? 0
            const activeNode =
                data.active_node || (queueDepth > 0 ? 'EXECUTING' : 'IDLE')

            console.log(
                `>> [INTERROGATE:OK] Interrogated '${workerId}' (${latencyMs}ms, VRAM: ${vramFree}/${vramTotal}MB) [OK]`,
            )

            return {
                workerId,
                reachable: true,
                latencyMs,
                vramFreeMb: vramFree,
                vramTotalMb: vramTotal,
                activeNode,
                queueDepth,
                probedAtMs,
            }
        } catch (err: any) {
            clearTimeout(timeoutTimer)
            const latencyMs = Date.now() - startTime
            const isTimeout =
                err?.name === 'AbortError' || controller.signal.aborted
            const errorMsg = isTimeout
                ? `PROBE_TIMEOUT_${timeoutMs}MS`
                : err?.message || 'SOCKET_ERROR'

            console.warn(
                `>> [INTERROGATE:FAIL] Failed probing '${workerId}': ${errorMsg}`,
            )

            return {
                workerId,
                reachable: false,
                latencyMs,
                vramFreeMb: 0,
                vramTotalMb: 0,
                activeNode: 'UNREACHABLE',
                queueDepth: 0,
                error: errorMsg,
                probedAtMs,
            }
        }
    }
}
