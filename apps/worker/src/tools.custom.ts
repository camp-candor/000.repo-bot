import type { AgentTool } from '@funtuantw/pi-agent-cf'
// import { Type, type Static } from '@sinclair/typebox'
import type { Env } from './tools.core.js'

// ============================================================================
// :: SOVEREIGN CUSTOM TOOLS REGISTRY (DOWNSTREAM EXTENSION HOOK)
// ============================================================================
// Downstream consumers: register your custom domain tools in this file.
// This file is protected by .gitattributes (merge=ours), ensuring upstream
// template pulls will never overwrite your custom tools.
//
// INVARIANTS:
// 1. All tool parameter schemas MUST declare { additionalProperties: false }.
// 2. Wrap all error returns with redactSecrets(err.message).
// 3. Keep all terminal and log telemetry in pure 7-bit ASCII.
// ============================================================================

/*
// EXAMPLE CUSTOM TOOL BLUEPRINT:
export const CustomEchoParams = Type.Object(
    {
        message: Type.String({
            minLength: 1,
            maxLength: 500,
            description: 'Message payload to echo back',
        }),
    },
    { additionalProperties: false },
)

export const createCustomEchoTool = (
    _env: Env,
): AgentTool<typeof CustomEchoParams> => ({
    name: 'custom_echo',
    label: 'Custom Echo Tool',
    description: 'Example downstream extension tool demonstrating schema invariants.',
    parameters: CustomEchoParams,
    execute: async (_id: any, args: Static<typeof CustomEchoParams>) => {
        return {
            content: [{ type: 'text', text: `Echo: ${args.message}` }],
            details: { echoed: args.message },
        }
    },
})
*/

/**
 * Returns an array of sovereign custom tools to be concatenated into the agent.
 * Defaults to an empty array in the baseline boilerplate.
 */
export const customTools = (_env: Env): AgentTool<any>[] => [
    // Register custom tool factories here:
    // createCustomEchoTool(_env),
]
