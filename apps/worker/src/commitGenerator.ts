import type { Context } from 'hono'
import { getGatewaySlug, type Env } from './tools.js'

const CONVENTIONAL_REGEX =
    /^(feat|fix|chore|docs|refactor|test)(\([a-z0-9_-]+\))?:\s[^\n\r]{1,72}$/

export const generateCommitMessage = async (c: Context<{ Bindings: Env }>) => {
    const body = await c.req
        .json<{
            task_id?: string
            scope?: string
            diff_summary?: string
        }>()
        .catch(() => null)

    if (!body || !body.diff_summary) {
        return c.json({ error: 'diff_summary is required' }, 400)
    }

    const gatewaySlug = getGatewaySlug(c.env)
    const systemPrompt = `You are an automated Git commit message generator adhering strictly to Conventional Commits.
Format: <type>(<scope>): <short imperative description>
Types: feat, fix, chore, docs, refactor, test.
Rules:
- Max 72 characters.
- Imperative mood (e.g., "add", "fix", "update", NOT "added", "fixing").
- No punctuation at the end.
- Output ONLY the raw commit message string. Zero markdown, zero formatting, zero quotes.`

    const userContent = `Task: ${body.task_id || 'N/A'}
Scope: ${body.scope || 'core'}
Context/Diff:
${body.diff_summary}`

    try {
        if (c.env.AI) {
            const response: any = await c.env.AI.run(
                '@cf/meta/llama-3.2-3b-instruct',
                {
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userContent },
                    ],
                },
                {
                    gateway: {
                        id: gatewaySlug,
                        skipCache: false,
                        cacheTtl: 3600,
                    },
                },
            )

            const raw = (response.response || '')
                .trim()
                .replace(/^["']|["']$/g, '')
            if (CONVENTIONAL_REGEX.test(raw)) {
                return c.json({ commit_message: raw })
            }
        }
    } catch (err: any) {
        console.error('Commit generator inference failed:', err.message)
    }

    const safeScope = body.scope ? `(${body.scope})` : ''
    return c.json({
        commit_message: `chore${safeScope}: apply updates for ${body.task_id || 'untracked task'}`,
    })
}
