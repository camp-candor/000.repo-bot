import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
    verifySlackSignature,
    buildApprovalBlockKit,
} from '../../src/slackBridge.js'
import { handleSlackInteraction } from '../../src/routes/slackInteractions.js'
import * as tools from '../../src/tools.js'

describe('FEAT-04: Human Approval Gate & Slack Review Bridge', () => {
    const mockSigningSecret = 'test-slack-signing-secret-12345'
    const mockEnv: tools.Env = {
        CLOUDFLARE_ACCOUNT_ID: 'test-acc',
        CLOUDFLARE_API_TOKEN: 'test-token',
        CLOUDFLARE_AI_GATEWAY: 'test-gw',
        GITHUB_TOKEN: 'test-gh-token',
        GITHUB_WEBHOOK_SECRET: 'test-secret',
        SLACK_BOT_TOKEN: 'xoxb-test-token',
        SLACK_SIGNING_SECRET: mockSigningSecret,
        SLACK_AUTHORIZED_APPROVERS: 'U12345,U67890',
        AI: {} as any,
    REPO_BOT_DO: {} as any,
    }

    beforeEach(() => {
        vi.restoreAllMocks()
    })

    describe('1. Slack Cryptographic Signature Verification', () => {
        async function createValidSignature(
            body: string,
            timestamp: number,
            secret: string,
        ) {
            const baseString = `v0:${timestamp}:${body}`
            const encoder = new TextEncoder()
            const key = await crypto.subtle.importKey(
                'raw',
                encoder.encode(secret),
                { name: 'HMAC', hash: 'SHA-256' },
                false,
                ['sign'],
            )
            const signature = await crypto.subtle.sign(
                'HMAC',
                key,
                encoder.encode(baseString),
            )
            const hex = Array.from(new Uint8Array(signature))
                .map((b) => b.toString(16).padStart(2, '0'))
                .join('')
            return `v0=${hex}`
        }

        it('validates authentic signatures within timestamp window', async () => {
            const body = 'payload=%7B%22type%22%3A%22block_actions%22%7D'
            const timestamp = Math.floor(Date.now() / 1000)
            const signature = await createValidSignature(
                body,
                timestamp,
                mockSigningSecret,
            )

            const result = await verifySlackSignature(
                body,
                { timestamp: String(timestamp), signature },
                mockSigningSecret,
            )
            expect(result.valid).toBe(true)
        })

        it('rejects forged signatures', async () => {
            const body = 'payload=%7B%22type%22%3A%22block_actions%22%7D'
            const timestamp = Math.floor(Date.now() / 1000)

            const result = await verifySlackSignature(
                body,
                {
                    timestamp: String(timestamp),
                    signature: 'v0=deadbeef1234567890',
                },
                mockSigningSecret,
            )
            expect(result.valid).toBe(false)
            expect(result.reason).toBe('HMAC verification failed')
        })

        it('rejects timestamps older than 300 seconds (replay defense)', async () => {
            const body = 'payload=%7B%22type%22%3A%22block_actions%22%7D'
            const expiredTimestamp = Math.floor(Date.now() / 1000) - 301
            const signature = await createValidSignature(
                body,
                expiredTimestamp,
                mockSigningSecret,
            )

            const result = await verifySlackSignature(
                body,
                { timestamp: String(expiredTimestamp), signature },
                mockSigningSecret,
            )
            expect(result.valid).toBe(false)
            expect(result.reason).toContain('Timestamp skewed')
        })
    })

    describe('2. Block Kit Card Generation', () => {
        it('constructs structured approval card with high-risk files and bound action payloads', () => {
            const card = buildApprovalBlockKit({
                taskId: 'task-04.01',
                owner: 'camp-candor',
                repo: '000.repo-bot',
                pullNumber: 42,
                headSha: 'c7f4901b8e42f9a0d8431e21b7782a1290f12c34',
                branchName: 'spec/task-04.01-c7f4901',
                highRiskFiles: ['characters/silas.md', 'world/factions.md'],
            })

            expect(card.text).toContain('task-04.01')
            expect(card.blocks.length).toBe(4)

            const actionsBlock = card.blocks.find(
                (b: any) => b.block_id === 'approval_actions',
            ) as any
            expect(actionsBlock).toBeDefined()
            expect(actionsBlock.elements.length).toBe(2)

            const approveBtn = actionsBlock.elements.find(
                (e: any) => e.action_id === 'approve_task',
            )
            expect(approveBtn).toBeDefined()

            const parsedValue = JSON.parse(approveBtn.value)
            expect(parsedValue.taskId).toBe('task-04.01')
            expect(parsedValue.headSha).toBe(
                'c7f4901b8e42f9a0d8431e21b7782a1290f12c34',
            )
        })
    })

    describe('3. Form-Encoded Webhook Ingestion & RBAC', () => {
        function createMockContext(
            bodyText: string,
            headers: Record<string, string> = {},
        ) {
            let executedPromise: Promise<any> | null = null
            return {
                req: {
                    text: async () => bodyText,
                    header: (name: string) => headers[name.toLowerCase()],
                },
                env: {
                    ...mockEnv,
          SLACK_SIGNING_SECRET: 'test-secret', // Added so verification logic can proceed
                    REPO_BOT_DO: {
                        idFromName: vi.fn().mockReturnValue('mock-do-id'),
                        get: vi.fn().mockReturnValue({
                            fetch: vi
                                .fn()
                                .mockResolvedValue(
                                    new Response(JSON.stringify({ ok: true })),
                                ),
                        }),
                    },
                },
                executionCtx: {
                    waitUntil: (p: Promise<any>) => {
                        executedPromise = p
                    },
                },
                text: (msg: string, status = 200) => ({ body: msg, status }),
                json: (body: any, status = 200) => ({ body, status }),
                getExecutedPromise: () => executedPromise,
            } as any
        }

        it('rejects unauthorized Slack user clicks', async () => {
            // Mock verifySlackSignature to return true just for RBAC testing
            const verifySpy = vi.spyOn(await import('../../src/slackBridge.js'), 'verifySlackSignature')
            verifySpy.mockResolvedValue({ valid: true })

            const payload = {
                type: 'block_actions',
                user: { id: 'U_UNAUTHORIZED', name: 'intruder' },
                channel: { id: 'C123', name: 'ops-bridge' },
                actions: [
                    {
                        action_id: 'approve_task',
                        value: JSON.stringify({
                            taskId: 'task-04.01',
                            headSha: 'c7f4901b8e42f9a0d8431e21b7782a1290f12c34',
                            owner: 'camp-candor',
                            repo: '000.repo-bot',
                            pullNumber: 42,
                        }),
                    },
                ],
            }

            const encodedBody = `payload=${encodeURIComponent(JSON.stringify(payload))}`
            const ctx = createMockContext(encodedBody)

      const res: any = await handleSlackInteraction(ctx)
            expect(JSON.stringify(res.body)).toContain('Unauthorized')
        })

        it('accepts authorized approver clicks and dispatches async execution', async () => {
            const verifySpy = vi.spyOn(await import('../../src/slackBridge.js'), 'verifySlackSignature')
            verifySpy.mockResolvedValue({ valid: true })

            const payload = {
                type: 'block_actions',
                user: { id: 'U12345', name: 'lead_architect' },
                channel: { id: 'C123', name: 'ops-bridge' },
                actions: [
                    {
                        action_id: 'approve_task',
                        value: JSON.stringify({
                            taskId: 'task-04.01',
                            headSha: 'c7f4901b8e42f9a0d8431e21b7782a1290f12c34',
                            owner: 'camp-candor',
                            repo: '000.repo-bot',
                            pullNumber: 42,
                        }),
                    },
                ],
            }

            const encodedBody = `payload=${encodeURIComponent(JSON.stringify(payload))}`
            const ctx = createMockContext(encodedBody)

      const res: any = await handleSlackInteraction(ctx)
            expect(JSON.stringify(res.body)).toContain('[PROCESSING]')
            expect(ctx.getExecutedPromise()).not.toBeNull()
        })
    })
})
