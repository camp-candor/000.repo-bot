import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
    verifySlackSignature,
    buildApprovalBlockKit,
    sanitizeChannelId,
    buildLocalPushCard,
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
        GH_WEBHOOK_SECRET: 'test-secret',
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
            envOverrides: Partial<tools.Env> = {},
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
                    ...envOverrides,
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
            const verifySpy = vi.spyOn(
                await import('../../src/slackBridge.js'),
                'verifySlackSignature',
            )
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
            const verifySpy = vi.spyOn(
                await import('../../src/slackBridge.js'),
                'verifySlackSignature',
            )
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

        it('accepts authorized approver clicks when SLACK_AUTHORIZED_APPROVERS contains surrounding quotes', async () => {
            const verifySpy = vi.spyOn(
                await import('../../src/slackBridge.js'),
                'verifySlackSignature',
            )
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
            const ctx = createMockContext(
                encodedBody,
                {},
                {
                    SLACK_AUTHORIZED_APPROVERS: '"U12345 , U67890"',
                },
            )

            const res: any = await handleSlackInteraction(ctx)
            expect(JSON.stringify(res.body)).toContain('[PROCESSING]')
            expect(ctx.getExecutedPromise()).not.toBeNull()
        })
    })
    describe('4. URL Verification Challenge Handshake', () => {
        it('responds with challenge parameter when receiving url_verification', async () => {
            const body = JSON.stringify({
                type: 'url_verification',
                token: 'test-token',
                challenge: '3eZbrAqagDbOJTF0stAxqqga',
            })

            const ctx = {
                req: {
                    text: async () => body,
                    header: () => undefined,
                },
                env: {
                    ...mockEnv,
                    SLACK_SIGNING_SECRET: undefined, // Bypassed for handshake test
                },
                json: (data: any, status = 200) => ({ body: data, status }),
                text: (msg: string, status = 200) => ({ body: msg, status }),
            } as any

            const res: any = await handleSlackInteraction(ctx)
            expect(res.status).toBe(200)
            expect(res.body.challenge).toBe('3eZbrAqagDbOJTF0stAxqqga')
        })
    })

    describe('5. Slack Channel Sanitization', () => {
        it('strips quotes and whitespace and defaults to C0C40FMRQ9H', () => {
            expect(sanitizeChannelId('"C12345"')).toBe('C12345')
            expect(sanitizeChannelId("'C67890'")).toBe('C67890')
            expect(sanitizeChannelId('  "C12345"  ')).toBe('C12345')
            expect(sanitizeChannelId('#ops-bridge')).toBe('C0C40FMRQ9H')
            expect(sanitizeChannelId('')).toBe('C0C40FMRQ9H')
            expect(sanitizeChannelId(undefined)).toBe('C0C40FMRQ9H')
        })
    })

    describe('6. Local Workstation Push Notification Card', () => {
        it('formats the card with #36C5F0 color, points to #ops-bridge, and includes compare URL and commit summary', () => {
            const params = {
                repo: 'camp-candor/000.repo-bot',
                branch: 'main',
                pusher: 'elliotbradly',
                headCommitSha: '4ba70a9c9bece5dc5a23965a3df54d6595466e99',
                commitMessage:
                    'feat(slack): workstation push alert\n\nDetailed commit body here',
                compareUrl:
                    'https://github.com/camp-candor/000.repo-bot/compare/1234567...4ba70a9',
                addedCount: 2,
                modifiedCount: 3,
                removedCount: 1,
            }

            const card = buildLocalPushCard(params, mockEnv)

            expect(card.channel).toBe('C0C40FMRQ9H') // #ops-bridge
            expect(card.attachments).toHaveLength(1)
            expect(card.attachments[0].color).toBe('#36C5F0') // Electric Cyan

            const blocks = card.attachments[0].blocks
            expect(blocks).toBeDefined()

            // Header block
            expect(blocks[0].type).toBe('header')
            expect(blocks[0].text.text).toBe(
                ':: DIRECT WORKSTATION PUSH DETECTED',
            )

            // Context section
            expect(blocks[1].type).toBe('section')
            expect(blocks[1].text.text).toBe(
                '*ORIGIN:* `LOCAL WORKBENCH (CLI PUSH)`',
            )

            // Section fields
            expect(blocks[2].type).toBe('section')
            expect(blocks[2].fields).toBeDefined()
            const fieldsText = blocks[2].fields
                .map((f: any) => f.text)
                .join(' ')
            expect(fieldsText).toContain(
                '*Repository:* `camp-candor/000.repo-bot`',
            )
            expect(fieldsText).toContain('*Branch:* `main`')
            expect(fieldsText).toContain('*Pusher:* `elliotbradly`')
            expect(fieldsText).toContain('*Commit:* `4ba70a9`')

            // Commit summary block
            expect(blocks[3].type).toBe('section')
            expect(blocks[3].text.text).toBe(
                '>feat(slack): workstation push alert',
            )

            // Action elements
            expect(blocks[4].type).toBe('actions')
            expect(blocks[4].elements).toHaveLength(1)
            expect(blocks[4].elements[0].type).toBe('button')
            expect(blocks[4].elements[0].text.text).toBe(
                'View Commit Diff [GitHub]',
            )
            expect(blocks[4].elements[0].url).toBe(params.compareUrl)
        })

        it('handles push webhook event and dispatches local push notification', async () => {
            const { default: app } = await import('../../src/index.js')
            const originalFetch = globalThis.fetch
            let postedPayload: any = null

            globalThis.fetch = vi
                .fn()
                .mockImplementation(async (url: string, init?: any) => {
                    if (url.includes('slack.com/api/chat.postMessage')) {
                        postedPayload = JSON.parse(init.body)
                        return {
                            ok: true,
                            json: async () => ({ ok: true, ts: '123.456' }),
                        }
                    }
                    return { ok: true, json: async () => ({}) }
                }) as any

            const waitUntilPromises: Promise<any>[] = []
            const executionCtx = {
                waitUntil: (p: Promise<any>) => waitUntilPromises.push(p),
            }

            const req = new Request('http://localhost/webhook', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-github-event': 'push',
                },
                body: JSON.stringify({
                    ref: 'refs/heads/main',
                    repository: { full_name: 'camp-candor/000.repo-bot' },
                    pusher: { name: 'developer' },
                    compare:
                        'https://github.com/camp-candor/000.repo-bot/compare/abc...def',
                    head_commit: {
                        id: 'def4567890abcdef',
                        message: 'feat: add local card',
                        added: ['file1.ts'],
                        modified: ['file2.ts'],
                        removed: [],
                    },
                }),
            })

            const res = await app.fetch(
                req,
                { ...mockEnv, GH_WEBHOOK_SECRET: undefined } as any,
                executionCtx as any,
            )
            expect(res.status).toBe(200)
            const data: any = await res.json()
            expect(data.status).toBe('LOCAL_PUSH_NOTIFIED')

            await Promise.all(waitUntilPromises)
            expect(postedPayload).not.toBeNull()
            expect(postedPayload.attachments[0].color).toBe('#36C5F0')
            expect(postedPayload.channel).toBe('C0C40FMRQ9H')

            globalThis.fetch = originalFetch
        })
    })
})
