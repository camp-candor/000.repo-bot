import type { Context } from 'hono'
import {
    parseAskJulesMessage,
    resolveFleetRepo,
    type WatchedRepo,
} from '../pathNormalizer.js'
import { dispatchJulesJob } from '../jules.js'
import {
    postSlackJulesMessage,
    getTargetSlackChannel,
    verifySlackSignature,
} from '../slackBridge.js'
import type { Env } from '../tools.js'

/**
 * Handles incoming Slack Events API webhooks for #ask-jules interaction.
 */
export async function handleSlackEvents(c: Context<{ Bindings: Env }>) {
    const rawBody = await c.req.text()

    // 1. Signature Verification (if secret configured)
    if (c.env.SLACK_SIGNING_SECRET) {
        const timestamp = c.req.header('X-Slack-Request-Timestamp')
        const signature = c.req.header('X-Slack-Signature')
        const check = await verifySlackSignature(
            rawBody,
            { timestamp, signature },
            c.env.SLACK_SIGNING_SECRET,
        )
        if (!check.valid && !rawBody.includes('url_verification')) {
            return c.json({ error: 'UNAUTHORIZED_SIGNATURE' }, 401)
        }
    }

    let body: any = {}
    try {
        body = JSON.parse(rawBody)
    } catch {
        return c.text('Invalid JSON', 400)
    }

    // 2. Respond to Slack URL Verification Challenge
    if (body.type === 'url_verification') {
        return c.json({ challenge: body.challenge }, 200)
    }

    const askJulesChannel = getTargetSlackChannel('ASK_JULES', c.env)

    // 3. Process Message Event Callback
    if (body.type === 'event_callback' && body.event) {
        const event = body.event

        // Restrict strictly to configured channel and ignore bot echoes
        if (
            event.type === 'message' &&
            event.channel === askJulesChannel &&
            !event.bot_id &&
            !event.subtype
        ) {
            const rawText = (event.text || '').trim()
            const parsed = parseAskJulesMessage(rawText)

            if (!parsed) {
                c.executionCtx.waitUntil(
                    postSlackDiagnostic(
                        askJulesChannel,
                        '[INVALID FORMAT] Please use the format:\n`<repo-path> : <task-prompt>`\n\n*Example:*\n`PS D:\\arte\\work\\campc-it-com\\000.repo-bot> : execute [data/directive/014.ag-check.md]`',
                        '#ECB22E',
                        c.env,
                    ),
                )
                return c.json({ ok: true }, 200)
            }

            // Offload asynchronous execution to satisfy <3000ms SLA
            c.executionCtx.waitUntil(
                processAskJulesPrompt(
                    parsed.rawPath,
                    parsed.prompt,
                    askJulesChannel,
                    c.env,
                ),
            )

            return c.json({ ok: true }, 200)
        }
    }

    return c.json({ ok: true }, 200)
}

/**
 * Extracts automated file whitelist based on prompt semantics to enforce monorepo scoping.
 */
export function extractFileWhitelist(prompt: string): string[] {
    const isVersionBump =
        /\bbump\b/i.test(prompt) && /\bversion\b/i.test(prompt)
    const mentionsRootOnly = /\b(root|main)\b/i.test(prompt)

    if (isVersionBump || mentionsRootOnly) {
        return ['package.json']
    }
    return []
}

async function processAskJulesPrompt(
    rawPath: string,
    prompt: string,
    channel: string,
    env: Env,
) {
    try {
        // A. Ingest Watched Fleet from RepoBotDO
        let fleet: WatchedRepo[] = []
        if (env.REPO_BOT_DO) {
            try {
                const doId = env.REPO_BOT_DO.idFromName('global-fleet-monitor')
                const stub = env.REPO_BOT_DO.get(doId)
                const res = await stub.fetch('https://internal/repos')
                if (res.ok) {
                    fleet = (await res.json()) as WatchedRepo[]
                }
            } catch (err: any) {
                console.warn(
                    '[FLEET_QUERY_WARN] Durable Object query bypassed:',
                    err.message,
                )
            }
        }

        // Default baseline fallback if DO has not initialized fleet yet
        if (fleet.length === 0) {
            fleet = [
                {
                    id: 'camp-candor/000.repo-bot',
                    owner: 'camp-candor',
                    repo: '000.repo-bot',
                    url: 'https://github.com/camp-candor/000.repo-bot',
                },
                {
                    id: 'camp-candor/002.worker-sower',
                    owner: 'camp-candor',
                    repo: '002.worker-sower',
                    url: 'https://github.com/camp-candor/002.worker-sower',
                },
                {
                    id: 'astro-kahn-it-com/000.astrokahn',
                    owner: 'astro-kahn-it-com',
                    repo: '000.astrokahn',
                    url: 'https://github.com/astro-kahn-it-com/000.astrokahn',
                },
                {
                    id: 'astro-kahn-it-com/001.goblin-lore',
                    owner: 'astro-kahn-it-com',
                    repo: '001.goblin-lore',
                    url: 'https://github.com/astro-kahn-it-com/001.goblin-lore',
                },
            ]
        }

        // B. Resolve Fleet Target
        const targetRepo = resolveFleetRepo(rawPath, fleet)

        if (!targetRepo) {
            const availableText = fleet.map((r) => ` • \`${r.id}\``).join('\n')

            await postSlackDiagnostic(
                channel,
                `[UNRECOGNIZED REPOSITORY]\nCould not match input: \`${rawPath}\`\n\n*Available Watched Repositories:*\n${availableText}`,
                '#E01E5A',
                env,
            )
            return
        }

        // C. Dispatch Session to Jules REST API
        const taskId = `ask-${Date.now().toString(36)}`
        const fileWhitelist = extractFileWhitelist(prompt)

        const fakeContext: any = {
            req: {
                json: async () => ({
                    owner: targetRepo.owner,
                    repo: targetRepo.repo,
                    taskId,
                    fileWhitelist,
                    prompt,
                }),
            },
            env,
            executionCtx: {
                waitUntil: (p: Promise<any>) => p.catch(() => null),
            },
            json: (data: any, status = 200) => ({ data, status }),
        }

        const dispatchResponse: any = await dispatchJulesJob(fakeContext)
        const dispatchResult = dispatchResponse.data

        if (!dispatchResult || !dispatchResult.sessionId) {
            throw new Error(
                dispatchResult?.error ||
                    'Failed to dispatch session to Jules API',
            )
        }

        // D. Post Initial Confirmation Card to #ask-jules
        await postSlackJulesMessage(
            {
                channel,
                text: `:: Jules Session Initialized: ${targetRepo.id}`,
                attachments: [
                    {
                        color: '#2EB886',
                        blocks: [
                            {
                                type: 'header',
                                text: {
                                    type: 'plain_text',
                                    text: ':: Jules Session Started',
                                    emoji: false,
                                },
                            },
                            {
                                type: 'section',
                                fields: [
                                    {
                                        type: 'mrkdwn',
                                        text: `*Repository:*\n\`${targetRepo.id}\``,
                                    },
                                    {
                                        type: 'mrkdwn',
                                        text: `*Task ID:*\n\`${taskId}\``,
                                    },
                                    {
                                        type: 'mrkdwn',
                                        text: `*Branch:*\n\`${dispatchResult.branch}\``,
                                    },
                                    {
                                        type: 'mrkdwn',
                                        text: `*Session:*\n<https://jules.google.com/session/${dispatchResult.sessionId}|${dispatchResult.sessionId}>`,
                                    },
                                ],
                            },
                            {
                                type: 'section',
                                text: {
                                    type: 'mrkdwn',
                                    text: `*Prompt:*\n> _${prompt.slice(0, 300)}_`,
                                },
                            },
                        ],
                    },
                ],
            },
            env,
        )
    } catch (err: any) {
        console.error('[PROCESS_ASK_JULES_ERROR]', err)
        await postSlackDiagnostic(
            channel,
            `[JULES DISPATCH FAILED]\nError processing request: ${err.message}`,
            '#E01E5A',
            env,
        )
    }
}

async function postSlackDiagnostic(
    channel: string,
    message: string,
    color: string,
    env: Env,
) {
    await postSlackJulesMessage(
        {
            channel,
            text: message,
            attachments: [
                {
                    color,
                    blocks: [
                        {
                            type: 'section',
                            text: { type: 'mrkdwn', text: message },
                        },
                    ],
                },
            ],
        },
        env,
    )
}
