export interface FleetWorkerTelemetry {
    workerId: string
    hostname: string
    gpuModel: string
    vramFreeMb: number
    status: string
    activeTaskId?: string | null
}

export function formatOverrideApplied(
    taskId: string,
    operatorId: string,
    newEpoch: number,
    diffSummary: string,
    reason: string,
): string {
    return [
        '```text',
        '================================================================================',
        '>> [CHATOPS:OVERRIDE] STORY ARCHITECT MANUAL OVERRIDE COMMITTED',
        '================================================================================',
        `TASK ID:        ${taskId}`,
        `OPERATOR:       ${operatorId}`,
        `NEW EPOCH:      ${newEpoch}`,
        `DIFF SUMMARY:   ${diffSummary}`,
        `REASON:         ${reason}`,
        'ACTION:         TASK RE-QUEUED :: MONOTONIC LEASE FENCE ADVANCED [OK]',
        '================================================================================',
        '```',
    ].join('\n')
}

export function formatForceRetry(
    taskId: string,
    operatorId: string,
    newEpoch: number,
    reason: string,
): string {
    return [
        '```text',
        '================================================================================',
        '>> [CHATOPS:RETRY] MANUAL TASK RETRY INITIATED',
        '================================================================================',
        `TASK ID:        ${taskId}`,
        `OPERATOR:       ${operatorId}`,
        `NEW EPOCH:      ${newEpoch}`,
        `REASON:         ${reason}`,
        'ACTION:         ATTEMPT RESET :: TASK RE-QUEUED TO FAIR QUEUE [OK]',
        '================================================================================',
        '```',
    ].join('\n')
}

export function formatTaskAborted(
    taskId: string,
    operatorId: string,
    reason: string,
): string {
    return [
        '```text',
        '================================================================================',
        '>> [CHATOPS:ABORT] TASK EXECUTION HARD CANCELED',
        '================================================================================',
        `TASK ID:        ${taskId}`,
        `OPERATOR:       ${operatorId}`,
        `REASON:         ${reason}`,
        'ACTION:         WATCHDOG DISARMED :: STATE COMMITTED AS ABORTED [HALT]',
        '================================================================================',
        '```',
    ].join('\n')
}

export function formatStatusResponse(
    taskId: string,
    fsmState: string,
    epoch: number,
    attemptCount: number,
    maxAttempts: number,
    ledgerHeadHash: string,
    activeWorker?: string | null,
): string {
    return [
        '```text',
        '================================================================================',
        '>> [CHATOPS:STATUS] CONTROL PLANE TASK TELEMETRY',
        '================================================================================',
        `TASK ID:        ${taskId}`,
        `STATE:          ${fsmState}`,
        `ACTIVE LEASE:   ${activeWorker || 'NONE'}`,
        `EPOCH:          ${epoch}`,
        `ATTEMPTS:       ${attemptCount}/${maxAttempts}`,
        `LEDGER HEAD:    ${ledgerHeadHash.substring(0, 16)}...`,
        '================================================================================',
        '```',
    ].join('\n')
}

export function formatFleetResponse(workers: FleetWorkerTelemetry[]): string {
    const lines = workers.map(
        (w) =>
            `  * ${w.workerId.padEnd(16)} | ${w.gpuModel.padEnd(18)} | Free: ${String(w.vramFreeMb).padStart(5)}MB | ${w.status.padEnd(8)} | Task: ${w.activeTaskId || 'IDLE'}`,
    )

    return [
        '```text',
        '================================================================================',
        '>> [CHATOPS:FLEET] ACTIVE FOUNDRY GPU RUNNER STATUS',
        '================================================================================',
        `TOTAL RUNNERS:  ${workers.length}`,
        '--------------------------------------------------------------------------------',
        lines.length > 0 ? lines.join('\n') : '  (No registered runners found)',
        '================================================================================',
        '```',
    ].join('\n')
}

export class ChatOpsNotifier {
    /**
     * Dispatches pure 7-bit ASCII notifications to configured webhook URLs.
     */
    public async dispatchAlert(
        webhookUrl: string,
        formattedMessage: string,
    ): Promise<{ success: boolean; status: number }> {
        try {
            const response = await fetch(webhookUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': '000.repo-bot-chatops',
                },
                body: JSON.stringify({
                    text: formattedMessage,
                }),
            })

            console.log(
                `>> [CHATOPS:DISPATCH] Alert dispatched to ${webhookUrl} (Status: ${response.status}) [OK]`,
            )
            return { success: response.ok, status: response.status }
        } catch (err: any) {
            console.error(
                `>> [CHATOPS:ERR] Dispatch failed: ${err.message} [FAIL]`,
            )
            return { success: false, status: 0 }
        }
    }
}
