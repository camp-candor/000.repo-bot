import test from 'ava'
import sinon, { type SinonStub } from 'sinon'
import axios from 'axios'
import { AgentModel } from '../995.library/01.agent.unit/agent.model'
import {
    updateAgent,
    oracleAgent,
} from '../995.library/01.agent.unit/buz/agent.buzz'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a minimal bal object with a sinon spy as slv */
function makeBal(src?: string) {
    return { src, slv: sinon.fake() } as any
}

/** Create a fresh model clone (matches reducer pattern) */
function makeModel() {
    return new AgentModel()
}

/** Null state — buzzers that use ste are UI-coupled; unit tests pass null */
const ste = null as any

/**
 * Create a sinon sandbox scoped to a single test.
 * AVA runs tests concurrently, so we cannot use global sinon.stub/restore.
 */
function createSandbox(t: any) {
    const sandbox = sinon.createSandbox()
    t.teardown(() => sandbox.restore())
    return sandbox
}

// ---------------------------------------------------------------------------
// updateAgent
// ---------------------------------------------------------------------------

test.serial(
    'updateAgent — returns "No prompt provided" when bal.src is undefined',
    async (t) => {
        const bal = makeBal(undefined)
        await updateAgent(makeModel(), bal, ste)

        t.true(bal.slv.calledOnce)
        const result = bal.slv.firstCall.args[0]
        t.is(result.agentBit.src, 'No prompt provided')
    },
)

test.serial(
    'updateAgent — returns "No prompt provided" when bal.src is empty string',
    async (t) => {
        const bal = makeBal('')
        await updateAgent(makeModel(), bal, ste)

        t.true(bal.slv.calledOnce)
        t.is(bal.slv.firstCall.args[0].agentBit.src, 'No prompt provided')
    },
)

test.serial(
    'updateAgent — sends prompt and extracts string content from assistant',
    async (t) => {
        const sandbox = createSandbox(t)
        const postStub = sandbox
            .stub(axios, 'post')
            .resolves({ data: { ok: true } })
        const getStub = sandbox.stub(axios, 'get').resolves({
            data: {
                messages: [
                    { role: 'user', content: 'roll 2d6' },
                    { role: 'assistant', content: 'You rolled a 7!' },
                ],
                isStreaming: false,
            },
        })

        const bal = makeBal('roll 2d6')
        await updateAgent(makeModel(), bal, ste)

        // Verify POST was called with correct endpoint and body
        t.true(postStub.calledOnce)
        const [postUrl, postBody] = postStub.firstCall.args
        t.true(postUrl.includes('/sessions/cli-agent-session/prompt'))
        t.deepEqual(postBody, { prompt: 'roll 2d6' })

        // Verify result
        t.true(bal.slv.calledOnce)
        t.is(bal.slv.firstCall.args[0].agentBit.src, 'You rolled a 7!')
        t.is(bal.slv.firstCall.args[0].agentBit.idx, 'update-agent')

        // Verify GET was called for state polling
        t.true(getStub.calledOnce)
    },
)

test.serial(
    'updateAgent — extracts text from array content shape',
    async (t) => {
        const sandbox = createSandbox(t)
        sandbox.stub(axios, 'post').resolves({ data: { ok: true } })
        sandbox.stub(axios, 'get').resolves({
            data: {
                messages: [
                    { role: 'user', content: 'roll 2d6' },
                    {
                        role: 'assistant',
                        content: [
                            { type: 'text', text: '{"total":7,"rolls":[3,4]}' },
                        ],
                    },
                ],
                isStreaming: false,
            },
        })

        const bal = makeBal('roll 2d6')
        await updateAgent(makeModel(), bal, ste)

        t.true(bal.slv.calledOnce)
        t.is(
            bal.slv.firstCall.args[0].agentBit.src,
            '{"total":7,"rolls":[3,4]}',
        )
    },
)

test.serial(
    'updateAgent — joins multiple text items in array content',
    async (t) => {
        const sandbox = createSandbox(t)
        sandbox.stub(axios, 'post').resolves({ data: { ok: true } })
        sandbox.stub(axios, 'get').resolves({
            data: {
                messages: [
                    {
                        role: 'assistant',
                        content: [
                            { type: 'text', text: 'Line one' },
                            { type: 'text', text: 'Line two' },
                        ],
                    },
                ],
                isStreaming: false,
            },
        })

        const bal = makeBal('hello')
        await updateAgent(makeModel(), bal, ste)

        t.is(bal.slv.firstCall.args[0].agentBit.src, 'Line one\nLine two')
    },
)

test.serial('updateAgent — polls until streaming stops', async (t) => {
    const sandbox = createSandbox(t)
    sandbox.stub(axios, 'post').resolves({ data: { ok: true } })

    const getStub = sandbox.stub(axios, 'get')

    // First call: still streaming
    getStub.onFirstCall().resolves({
        data: {
            messages: [{ role: 'assistant', content: 'partial...' }],
            isStreaming: true,
        },
    })

    // Second call: done
    getStub.onSecondCall().resolves({
        data: {
            messages: [{ role: 'assistant', content: 'Final answer' }],
            isStreaming: false,
        },
    })

    const bal = makeBal('think hard')
    await updateAgent(makeModel(), bal, ste)

    t.is(getStub.callCount, 2)
    t.is(bal.slv.firstCall.args[0].agentBit.src, 'Final answer')
})

test.serial('updateAgent — returns error on network failure', async (t) => {
    const sandbox = createSandbox(t)
    sandbox.stub(axios, 'post').rejects(new Error('Network Error'))

    const bal = makeBal('hello')
    await updateAgent(makeModel(), bal, ste)

    t.true(bal.slv.calledOnce)
    t.is(bal.slv.firstCall.args[0].agentBit.src, 'Error: Network Error')
})

test.serial(
    'updateAgent — returns error when state polling fails',
    async (t) => {
        const sandbox = createSandbox(t)
        sandbox.stub(axios, 'post').resolves({ data: { ok: true } })
        sandbox.stub(axios, 'get').rejects(new Error('Service Unavailable'))

        const bal = makeBal('hello')
        await updateAgent(makeModel(), bal, ste)

        t.true(bal.slv.calledOnce)
        t.true(bal.slv.firstCall.args[0].agentBit.src.includes('Error:'))
    },
)

// ---------------------------------------------------------------------------
// oracleAgent
// ---------------------------------------------------------------------------

test.serial(
    'oracleAgent — returns "No prompt provided" when bal.src is empty',
    async (t) => {
        const bal = makeBal(undefined)
        await oracleAgent(makeModel(), bal, ste)

        t.true(bal.slv.calledOnce)
        t.is(bal.slv.firstCall.args[0].agentBit.src, 'No prompt provided')
    },
)

test.serial(
    'oracleAgent — calls /oracle endpoint and returns response data',
    async (t) => {
        const sandbox = createSandbox(t)
        sandbox.stub(axios, 'get').resolves({ data: '{"result":"nat 20"}' })

        const bal = makeBal('roll a d20')
        await oracleAgent(makeModel(), bal, ste)

        t.true(bal.slv.calledOnce)
        const result = bal.slv.firstCall.args[0]
        t.is(result.agentBit.idx, 'oracle-agent')
        t.is(result.agentBit.src, '{"result":"nat 20"}')
    },
)

test.serial('oracleAgent — passes prompt as query parameter', async (t) => {
    const sandbox = createSandbox(t)
    const getStub = sandbox.stub(axios, 'get').resolves({ data: 'ok' })

    const bal = makeBal('tell me a joke')
    await oracleAgent(makeModel(), bal, ste)

    const [url, config] = getStub.firstCall.args
    t.true(url.includes('/oracle'))
    t.deepEqual(config.params, { prompt: 'tell me a joke' })
})

test.serial('oracleAgent — returns error on network failure', async (t) => {
    const sandbox = createSandbox(t)
    sandbox.stub(axios, 'get').rejects(new Error('timeout of 5000ms exceeded'))

    const bal = makeBal('hello')
    await oracleAgent(makeModel(), bal, ste)

    t.true(bal.slv.calledOnce)
    t.is(
        bal.slv.firstCall.args[0].agentBit.src,
        'Error: timeout of 5000ms exceeded',
    )
    t.is(bal.slv.firstCall.args[0].agentBit.idx, 'oracle-agent')
})
