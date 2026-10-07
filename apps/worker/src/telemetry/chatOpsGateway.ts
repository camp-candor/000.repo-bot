import {
    authenticateChatOpsRequest,
    type ChatOpsRequestAuthResult,
} from './chatOpsAuth.js'

export interface ChatOpsGatewayConfig {
    secret: string
    outboundWebhookUrl?: string
}

/**
 * 7-Bit ASCII Notification Formatters
 */
export function formatPromotionNotification(
    taskId: string,
    epoch: number,
    canonicalKey: string,
    sha256: string,
): string {
    return [
        '```text',
        '================================================================================',
        '>> [CHATOPS:ALERT] CANONICAL PROMOTION COMMITTED',
        '================================================================================',
        `TASK ID:       ${taskId}`,
        `LEASE EPOCH:   ${epoch}`,
        `CANONICAL KEY: ${canonicalKey}`,
        `SHA-256:       ${sha256}`,
        'STATUS:        COMMITTED TO CANONICAL MANIFEST [OK]',
        '================================================================================',
        '```',
    ].join('\n')
}

export function formatWatchdogAlert(
    taskId: string,
    attempt: number,
    maxAttempts: number,
    epoch: number,
): string {
    return [
        '```text',
        '================================================================================',
        '>> [CHATOPS:ALERT] WATCHDOG LEASE EXPIRED - RETRY ENGAGED',
        '================================================================================',
        `TASK ID:       ${taskId}`,
        `ATTEMPT:       ${attempt}/${maxAttempts}`,
        `NEW EPOCH:     ${epoch}`,
        'ACTION:        ZOMBIE LEASE REVOKED :: TASK RE-QUEUED [RETRY]',
        '================================================================================',
        '```',
    ].join('\n')
}

export function formatDlqAlert(
    taskId: string,
    attemptCount: number,
    errorSummary: string,
): string {
    return [
        '```text',
        '================================================================================',
        '>> [CHATOPS:ALERT] CIRCUIT BREAKER TRIPPED - TASK QUARANTINED TO DLQ',
        '================================================================================',
        `TASK ID:       ${taskId}`,
        `TOTAL ATTEMPTS:${attemptCount}`,
        `DIAGNOSTIC:    ${errorSummary}`,
        'ACTION:        EXECUTION FROZEN :: HANDOFF TO STORY ARCHITECT [HALT]',
        '================================================================================',
        '```',
    ].join('\n')
}

export function formatLedgerAuditAlert(
    taskId: string,
    blockCount: number,
    latestHash: string,
): string {
    return [
        '```text',
        '================================================================================',
        '>> [CHATOPS:AUDIT] CRYPTOGRAPHIC LEDGER AUDIT VERIFIED',
        '================================================================================',
        `TASK ID:       ${taskId}`,
        `BLOCKS TOTAL:  ${blockCount}`,
        `LATEST HASH:   ${latestHash}`,
        'INTEGRITY:     UNBROKEN ZERO-TAMPER HASH-CHAIN [OK]',
        '================================================================================',
        '```',
    ].join('\n')
}

export class ChatOpsGateway {
    constructor(private config: ChatOpsGatewayConfig) {}

    /**
     * Intercepts and authenticates inbound ChatOps requests with fail-closed semantics.
     */
    public async interceptAndAuthenticate(
        request: Request,
        nowSec?: number,
    ): Promise<ChatOpsRequestAuthResult> {
        return authenticateChatOpsRequest(request, this.config.secret, nowSec)
    }
    /**
     * Dispatches pure 7-bit ASCII notifications to configured webhook targets.
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
                `>> [CHATOPS:DISPATCH] Webhook alert sent to ${webhookUrl} (Status: ${response.status}) [OK]`,
            )
            return { success: response.ok, status: response.status }
        } catch (err: any) {
            console.error(
                `>> [CHATOPS:ERR] Webhook transmission failed: ${err.message} [FAIL]`,
            )
            return { success: false, status: 0 }
        }
    }
}
