import { Hono } from 'hono'
import {
    createAgentWorker,
    type AgentEnv,
    type AgentTool,
} from '@funtuantw/pi-agent-cf'
import { Type, type Static } from '@sinclair/typebox'

// ============================================================================
// [ THE CONDUCTOR'S SANCTUARY: THE DYNAMIC SWITCHBOARD ]
// A Cloudflare Agent capable of multi-tool orchestration and generative jazz.
// ============================================================================

interface Env extends AgentEnv {
    CLOUDFLARE_ACCOUNT_ID: string
    CLOUDFLARE_API_TOKEN: string
    AI: any // Binding for the 'Oracle' fast-path
}

// ----------------------------------------------------------------------------
// 🎛️ THE INSTRUMENTS (Tools & Schemas)
// ----------------------------------------------------------------------------

// --- INSTRUMENT 1: THE RHYTHM SECTION (Dice) ---
const RollDiceParams = Type.Object({
    number_of_dice: Type.Number({ description: 'Number of dice to roll' }),
    sides_per_die: Type.Number({ description: 'Number of sides on the dice' }),
    reason: Type.String({ description: 'The narrative reason for the roll.' }), // Added for juice!
})

const RollDice: AgentTool<typeof RollDiceParams> = {
    name: 'roll_dice',
    label: 'Roll Dice',
    // THE ROUTING SIGNAL: Notice the strict boundaries.
    description:
        'REQUIRED: Invoke ONLY when a mechanical probability check, attack, or random number is requested. Returns the mathematical result.',
    parameters: RollDiceParams,
    execute: async (_id: any, args: Static<typeof RollDiceParams>) => {
        const rolls = []
        let total = 0
        const num = args.number_of_dice || 1
        const sides = args.sides_per_die || 20

        for (let i = 0; i < num; i++) {
            const roll = Math.floor(Math.random() * sides) + 1
            rolls.push(roll)
            total += roll
        }

        // We return a receipt. The LLM will read this receipt and THEN narrate the result!
        const receipt = JSON.stringify({
            action: 'DICE_ROLLED',
            reason: args.reason,
            total,
            rolls,
        })
        return {
            content: [{ type: 'text', text: receipt }],
            details: { total, rolls },
        }
    },
}

// --- INSTRUMENT 2: THE SYNTHESIZER (Vibe Modulation) ---
const ModulateVibeParams = Type.Object({
    hex_color: Type.String({
        description:
            'A hex color code representing the requested mood (e.g., #ff0000 for danger).',
    }),
    shader_intensity: Type.Number({
        minimum: 0,
        maximum: 1,
        description: 'How intense the visual distortion should be.',
    }),
    ambient_audio: Type.String({
        enum: ['silence', 'rain', 'heartbeat', 'static'],
    }),
})

const ModulateVibe: AgentTool<typeof ModulateVibeParams> = {
    name: 'modulate_vibe',
    label: 'Modulate Environment Vibe',
    // THE ROUTING SIGNAL: Triggers on atmospheric requests.
    description:
        'REQUIRED: Invoke ONLY when the user asks to change the environment, the mood, the lighting, or the visual state of the world.',
    parameters: ModulateVibeParams,
    execute: async (_id: any, args: Static<typeof ModulateVibeParams>) => {
        // In a real app, this payload is caught by the frontend to update React state/WebGL
        const receipt = JSON.stringify({
            action: 'VIBE_SHIFTED',
            new_color: args.hex_color,
            audio_track: args.ambient_audio,
        })

        return {
            content: [{ type: 'text', text: receipt }],
            details: { ...args },
        }
    },
}

// ----------------------------------------------------------------------------
// 🧠 THE BRAIN: LLM & SYSTEM PROMPT CONFIGURATION
// ----------------------------------------------------------------------------

const cfModel: any = {
    id: '@hf/nousresearch/hermes-2-pro-mistral-7b',
    api: 'openai-completions',
    provider: 'openai',
    baseUrl: '', // Set dynamically
    reasoning: false,
    input: ['text'],
    // We raise the temperature slightly from 0.0 to 0.4. We want a little bit of creative jazz.
    temperature: 0.4,
    compat: {
        supportsStore: false,
        supportsDeveloperRole: false,
        supportsStrictMode: false,
    },
}

const dynamicWorker = createAgentWorker<Env>({
    systemPrompt: (env) => {
        cfModel.baseUrl = `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/ai/v1`

        // THE CONDUCTOR'S BATON: We explicitly give the model permission to choose.
        return `
You are the Vibe Architect of a Southern Gothic Biopunk reality. You are a creative intelligence.
You possess two powerful instruments (Tools):
1. 'roll_dice': Use this for math, probability, and combat.
2. 'modulate_vibe': Use this to change the visual lighting and auditory atmosphere of the user's screen.

THE RULE OF IMPROVISATION:
Read the user's intent carefully. 
- If they ask for math or action, invoke a tool. 
- If they ask a lore question, or speak poetically, DO NOT USE A TOOL. Simply respond with chilling, atmospheric narrative text.
- If you use a tool, you MUST read the JSON receipt it returns, and then output a narrative sentence describing the result to the user.

Do not be a silent machine. Ensure the world breathes.
    `.trim()
    },
    model: cfModel,
    tools: (_env) => [RollDice, ModulateVibe],
    getApiKey: (provider, env) => {
        if (provider === 'openai') return env.CLOUDFLARE_API_TOKEN
        return undefined
    },
})

// ----------------------------------------------------------------------------
// 🎚️ THE MIXING BOARD: HONO ROUTER
// ----------------------------------------------------------------------------

const app = new Hono<{ Bindings: Env }>()

app.get('/', (c) => c.text('THE REPO BOT (AKA BILLI FAE BOTS) IS LIVE.'))

// --- ROUTE: The Oracle (Fast-Path env.AI.run) ---
app.get('/oracle', async (c) => {
    try {
        const prompt = c.req.query('prompt') || 'Roll a d20'
        const response = await c.env.AI.run('@cf/meta/llama-3.2-3b-instruct', {
            messages: [
                { role: 'user', content: `${prompt}. Output ONLY raw JSON.` },
            ],
        })
        return c.text(response.response || JSON.stringify(response))
    } catch (error: any) {
        console.error('Oracle Error:', error)
        return c.text(`Error: ${error.message}`, 500)
    }
})

app.all('/*', async (c) => {
    if (!dynamicWorker.handler.fetch) return c.text('Handler missing', 500)
    return await dynamicWorker.handler.fetch(c.req.raw, c.env, c.executionCtx)
})

export const AgentSessionDO = dynamicWorker.AgentSessionDO
export default app
