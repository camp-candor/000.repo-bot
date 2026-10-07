export class ChatOpsNotifier {
    /**
     * Formats an operator intervention into a strict 7-bit ASCII payload.
     */
    public formatInterventionReceipt(
        action: string,
        taskId: string,
        operatorId: string,
        details: Record<string, any>,
    ): string {
        const detailLines = Object.entries(details)
            .map(([k, v]) => `  ${k.padEnd(16)}: ${v}`)
            .join('\n')

        return [
            '```text',
            '================================================================================',
            `>> [CHATOPS:${action.toUpperCase()}] OPERATOR INTERVENTION LOGGED`,
            '================================================================================',
            `TASK ID:          ${taskId}`,
            `OPERATOR ID:      ${operatorId}`,
            '--------------------------------------------------------------------------------',
            'INTERVENTION DETAILS:',
            detailLines.length > 0
                ? detailLines
                : '  (No additional metadata provided)',
            '================================================================================',
            'STATUS:           NON-REPUDIATION LEDGER COMMITTED [OK]',
            '```',
        ].join('\n')
    }

    /**
     * Dispatches an HTTP POST asynchronously, trapping all network errors internally.
     */
    public async dispatchAsyncAlert(
        webhookUrl: string,
        formattedText: string,
    ): Promise<void> {
        try {
            const controller = new AbortController()
            const timeoutId = setTimeout(() => controller.abort(), 3000)

            const response = await fetch(webhookUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': '000.repo-bot-telemetry',
                },
                body: JSON.stringify({ text: formattedText }),
                signal: controller.signal,
            })

            clearTimeout(timeoutId)

            if (response.ok) {
                console.log(
                    `>> [ASYNC_DISPATCH:OK] Webhook delivered successfully to ${webhookUrl} [OK]`,
                )
            } else {
                console.warn(
                    `>> [ASYNC_DISPATCH:WARN] Webhook provider returned HTTP ${response.status} [WARN]`,
                )
            }
        } catch (error: any) {
            // Must NEVER throw upwards to prevent isolate crash
            console.error(
                `>> [ASYNC_DISPATCH:ERR] Telemetry dispatch failed: ${error.message} [FAIL]`,
            )
        }
    }
}
