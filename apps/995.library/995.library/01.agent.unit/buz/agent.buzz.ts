import axios from 'axios'
import type { AgentModel } from '../agent.model'
import type AgentBit from '../fce/agent.bit'
import type State from '../../99.core/state'

export const initAgent = (cpy: AgentModel, bal: AgentBit, ste: State) => {
    return cpy
}

export const updateAgent = async (
    cpy: AgentModel,
    bal: AgentBit,
    ste: State,
) => {
    const message = bal.src
    if (!message)
        return bal.slv({
            agentBit: { idx: 'update-agent', src: 'No prompt provided' },
        })

    try {
        // const WORKER_URL = 'https://worker-agent.berad4000.workers.dev';
        const WORKER_URL = 'http://localhost:8787'
        const sessionId = 'cli-agent-session'

        // 1. Send the prompt to the session's prompt endpoint (REST fire-and-forget)
        await axios.post(`${WORKER_URL}/sessions/${sessionId}/prompt`, {
            prompt: message,
        })

        // 2. Poll the state endpoint until the agent finishes generating
        let agentState: any
        let attempts = 0
        const maxAttempts = 30 // 30 seconds max

        while (attempts < maxAttempts) {
            const stateRes = await axios.get(
                `${WORKER_URL}/sessions/${sessionId}/state`,
            )
            agentState = stateRes.data

            // If we have messages and it's not streaming, we check if the last message is from the assistant
            if (agentState.messages && agentState.messages.length > 0) {
                const lastMsg =
                    agentState.messages[agentState.messages.length - 1]
                if (lastMsg.role === 'assistant' && !agentState.isStreaming) {
                    break
                }
            }

            // Wait 1 second before polling again
            await new Promise((resolve) => setTimeout(resolve, 1000))
            attempts++
        }

        if (
            !agentState ||
            !agentState.messages ||
            agentState.messages.length === 0
        ) {
            return bal.slv({
                agentBit: {
                    idx: 'update-agent',
                    src: 'Error: No response from agent',
                },
            })
        }

        const lastMessage = agentState.messages[agentState.messages.length - 1]
        let content = ''

        if (Array.isArray(lastMessage.content)) {
            content = lastMessage.content
                .map((c: any) => c.text || '')
                .join('\n')
        } else {
            content = String(lastMessage.content)
        }

        return bal.slv({ agentBit: { idx: 'update-agent', src: content } })
    } catch (err: any) {
        return bal.slv({
            agentBit: { idx: 'update-agent', src: 'Error: ' + err.message },
        })
    }
}

export const oracleAgent = async (
    cpy: AgentModel,
    bal: AgentBit,
    ste: State,
) => {
    const prompt = bal.src
    if (!prompt)
        return bal.slv({
            agentBit: { idx: 'update-agent', src: 'No prompt provided' },
        })

    try {
        const response = await axios.get(
            `https://worker-agent.berad4000.workers.dev/oracle`,
            {
                params: { prompt },
            },
        )

        return bal.slv({
            agentBit: { idx: 'oracle-agent', src: response.data },
        })
    } catch (err: any) {
        return bal.slv({
            agentBit: { idx: 'oracle-agent', src: 'Error: ' + err.message },
        })
    }
}
export const testAgent = async (cpy: AgentModel, bal: AgentBit, ste: State) => {
    const { exec } = require('child_process')

    // Use --run to avoid watch mode and --no-color to avoid ANSI codes
    exec(
        'npm test --workspace=@camp_candor/agent -- --run --no-color',
        { maxBuffer: 1024 * 1024 },
        (err, stdout, stderr) => {
            let src = ''
            if (stdout) src += stdout
            if (stderr) src += '\n' + stderr

            // Filter out some noise and trim
            const lst = src.split('\n').filter((line) => {
                const l = line.trim()
                if (l.length === 0) return false
                if (line.startsWith('npm ')) return false
                if (line.startsWith('> ')) return false
                if (line.includes('[vpw:')) return false
                if (line.includes('RUN ')) return false // Filter out the RUN header noise
                return true
            })

            if (bal.slv != null)
                bal.slv({ agentBit: { idx: 'test-agent', lst } })
        },
    )

    return cpy
}
