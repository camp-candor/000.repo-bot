import { type Context } from 'hono'
import { type Env } from './tools.js'

export const CONVENTIONAL_COMMIT_REGEX =
    /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([a-z0-9-_.]+\))?: .{1,100}$/i

export async function generateCommitMessage(c: Context<{ Bindings: Env }>) {
    try {
        const body = await c.req
            .json<{ diff?: string; hint?: string }>()
            .catch(() => ({}) as any)
        const diff = body.diff || ''
        const hint = body.hint || 'apply updates'

        if (!diff) {
            return c.json({ error: 'Diff is required' }, 400)
        }

        if (!c.env.AI) {
            return c.json({ commitMessage: `chore(repo): ${hint}` })
        }

        const prompt = `Analyze this git diff and write a single Conventional Commit message (e.g. feat(scope): desc).
No markdown, no quotes, no explanations, no trailing punctuation. Exactly one line.
Hint: ${hint}

Diff:
${diff.slice(0, 4000)}`

        const response: any = await c.env.AI.run(
            '@cf/meta/llama-3.2-3b-instruct',
            {
                messages: [{ role: 'user', content: prompt }],
            },
        )

        const rawText =
            typeof response?.response === 'string'
                ? response.response
                : typeof response === 'string'
                  ? response
                  : ''

        const firstLine = rawText
            .trim()
            .replace(/^["'`]|["'`]$/g, '')
            .split('\n')[0]
            .trim()

        const commitMessage = CONVENTIONAL_COMMIT_REGEX.test(firstLine)
            ? firstLine
            : 'chore(scope): apply updates'

        return c.json({ commitMessage })
    } catch (error: any) {
        return c.json({
            commitMessage: 'chore(scope): apply updates',
            warning: error.message,
        })
    }
}
