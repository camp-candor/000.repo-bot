// ----- SOURCE: ..\..\packages\000.server\00.server.unit\buz\server.buzz.ts -----
import { ServerModel } from '../server.model.js'
import type ServerBit from '../fce/server.bit.js'
import type State from '../../99.core/state.js'
import { gameState } from '../server.model.js'

export const initServer = (cpy: ServerModel, bal: ServerBit, ste: State) => {
    // 1. THE TARGETS
    const urlserver = 'https://zero00-server.onrender.com/api/server/test'
    const urlSpace = 'https://zero00-server.onrender.com/api/space/test'

    // 2. THE EXECUTION CONTEXT
    // We launch an async operation immediately so we don't block the UI thread.
    ;(async () => {
        try {
            // 3. THE PARALLEL BLAST (Promise.all)
            // We fire both missiles at the same time.
            // We await the completion of BOTH before proceeding.
            const [resserver, resSpace] = await Promise.all([
                fetch(urlserver),
                fetch(urlSpace),
            ])

            // 4. THE INTEGRITY CHECK
            if (!resserver.ok)
                throw new Error(`server fetch failed: ${resserver.status}`)
            if (!resSpace.ok)
                throw new Error(`Space fetch failed: ${resSpace.status}`)

            // 5. THE EXTRACTION
            const serverData = await resserver.json()
            const spaceData = await resSpace.json()

            // 6. THE HARMONY (Success)
            // We compose the results into a single clean object.
            if (bal.slv != null) {
                bal.slv({
                    intBit: {
                        idx: 'init-server',
                        dat: {
                            server: serverData,
                            space: spaceData,
                        },
                    },
                })
            }
        } catch (err) {
            // 7. THE DISSONANCE (Failure)
            if (bal.slv != null) {
                bal.slv({
                    intBit: {
                        idx: 'init-server-err',
                        dat:
                            err instanceof Error
                                ? err.message
                                : 'Unknown Error',
                    },
                })
            }
        }
    })()

    // 8. THE FLOW CONTINUES
    // We return the copy immediately while the network does its work.
    return cpy
}

export const visionServer = async (
    cpy: ServerModel,
    bal: ServerBit,
    ste: State,
) => {
    const userPrompt = bal.src || 'No prompt provided to the mire.'

    const workerUrl = 'https://zero00-server.onrender.com/api/intellect/vision'

    try {
        // 🟢 The 'await' here pauses execution until the Worker responds
        const response = await fetch(workerUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: userPrompt, image: bal.dat }),
        })

        if (!response.ok) throw new Error(`Status: ${response.status}`)

        // 🟢 We must also 'await' the parsing of the text/json
        const result = await response.json()
        var want = JSON.parse(result)

        // 3. Resolve the bit so the rest of the system gets the data
        bal.slv({ intBit: { idx: 'vision-intellect', dat: want.response } })
    } catch (err: any) {
        console.error('The Fungal Mind failed to respond:', err.message)
        bal.slv({ intBit: { idx: 'vision-intellect', err: err.message } })
    }

    // 4. Return the updated model
    return cpy
}

export const intellectServer = async (
    cpy: ServerModel,
    bal: ServerBit,
    ste: State,
) => {
    const userPrompt = bal.src || 'No prompt provided to the mire.'

    // 2. Point to your Worker
    const workerUrl = 'https://zero00-server.onrender.com/api/intellect/update'

    try {
        // 🟢 The 'await' here pauses execution until the Worker responds
        const response = await fetch(workerUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: userPrompt }),
        })

        if (!response.ok) throw new Error(`Status: ${response.status}`)

        // 🟢 We must also 'await' the parsing of the text/json
        const result = await response.json()
        var prom = JSON.parse(result)

        //if (prom.response.length < 3) {
        //  debugger;
        //}

        var output = dredgeMangledVerdict(prom.response)

        // 3. Resolve the bit so the rest of the system gets the data
        bal.slv({ intBit: { idx: 'update-intellect', dat: output } })
    } catch (err: any) {
        console.error('The Fungal Mind failed to respond:', err.message)
        bal.slv({ intBit: { idx: 'update-intellect', err: err.message } })
    }

    // 4. Return the updated model
    return cpy
}

export const updateServer = (cpy: ServerModel, bal: ServerBit, ste: State) => {
    return cpy
}

export const testServer = (cpy: ServerModel, bal: ServerBit, ste: State) => {
    bal.slv({ mytBit: { idx: 'test-server', val: 1 } })
    return cpy
}

export const serverPlayer = (bal: { idx: string }) => {
    const player = gameState.players[bal.idx]
    return player || null
}

export const serverMonster = (bal: { idx: string }) => {
    const monster = gameState.monsters[bal.idx]
    return monster || null
}

export const updateEntity = (bal: { idx: string; lst: any }) => {
    const entity = gameState.players[bal.idx] || gameState.monsters[bal.idx]

    if (entity) {
        Object.assign(entity, bal.lst)
        return true
    }

    return false
}

/**
 * Removes an entity from the game state and turn order.
 * @param bal - An object containing the entity's ID (idx).
 * @returns True if the entity was found and removed, false otherwise.
 */
export const removeEntity = (bal: { idx: string }) => {
    let entityFound = false
    if (gameState.players[bal.idx]) {
        delete gameState.players[bal.idx]
        entityFound = true
    } else if (gameState.monsters[bal.idx]) {
        delete gameState.monsters[bal.idx]
        entityFound = true
    }

    if (entityFound) {
        const turnOrderIndex = gameState.turnOrder.indexOf(bal.idx)
        if (turnOrderIndex > -1) {
            gameState.turnOrder.splice(turnOrderIndex, 1)
        }
    }

    return entityFound
}

export const dredgeMangledVerdict = (rawString) => {
    if (!rawString) return null

    try {
        // 🐊 The Regex Harvester
        // 1. Looks for the exact key "prompt": " (allowing for weird spacing)
        // 2. Captures EVERYTHING ([\s\S]*?) after the quote
        // 3. Stops capturing if it hits the closing JSON structure (" }), a final quote ("$), or the absolute end of the string ($)
        const regex = /"prompt"\s*:\s*"([\s\S]*?)(?:"\s*\}|"$|$)/
        const match = rawString.match(regex)

        if (match && match[1]) {
            // Clean up the dredged string
            // The LLM escapes quotes inside JSON (e.g., \"The Spirit Archive\"). We need to unescape them.
            const extractedPrompt = match[1]
                .replace(/\\"/g, '"') // Convert \" back to "
                .replace(/\\\\/g, '\\') // Convert \\ back to \
                .replace(/\\n/g, '\n') // Convert escaped newlines back to actual newlines
                .trim()

            return extractedPrompt
        }

        console.warn('🐊 The Fungal Eye found no prompt in the sludge.')
        return null
    } catch (err) {
        console.error('❌ Fatal error dredging the mire:', err.message)
        debugger
        return null
    }
}

// ----- SOURCE: ..\..\packages\000.server\00.server.unit\fce\server.bit.ts -----
export default interface ServerBit {
    idx: string
    src?: string
    val?: number
    dat?: any
    slv?: Function
}

// ----- SOURCE: ..\..\packages\000.server\00.server.unit\fce\server.interface.ts -----
import type ServerBit from './server.bit.js'

export default interface Server {
    // idx:string;
    // serverBitList: ServerBit[];
    // serverBits:any;
}

// ----- SOURCE: ..\..\packages\000.server\00.server.unit\server.action.ts -----
import type { Action } from '../99.core/interface/action.interface.js'
import type ServerBit from './fce/server.bit.js'

// server actions

export const INIT_SERVER = '[Server action] Init Server'
export class InitServer implements Action {
    readonly type = INIT_SERVER
    constructor(public bale: ServerBit) {}
}

export const UPDATE_SERVER = '[Server action] Update Server'
export class UpdateServer implements Action {
    readonly type = UPDATE_SERVER
    constructor(public bale: ServerBit) {}
}

export const TEST_SERVER = '[Test action] Test Server'
export class TestServer implements Action {
    readonly type = TEST_SERVER
    constructor(public bale: ServerBit) {}
}

export const INTELLECT_SERVER = '[Intellect action] Intellect Server'
export class IntellectServer implements Action {
    readonly type = INTELLECT_SERVER
    constructor(public bale: ServerBit) {}
}

export const VISION_SERVER = '[Vision action] Vision Server'
export class VisionServer implements Action {
    readonly type = VISION_SERVER
    constructor(public bale: ServerBit) {}
}

export type Actions =
    InitServer | UpdateServer | TestServer | IntellectServer | VisionServer

// ----- SOURCE: ..\..\packages\000.server\00.server.unit\server.buzzer.ts -----
export { initServer } from './buz/server.buzz.js'
export { updateServer } from './buz/server.buzz.js'
export { testServer } from './buz/server.buzz.js'
export { serverPlayer } from './buz/server.buzz.js'
export { serverMonster } from './buz/server.buzz.js'
export { updateEntity } from './buz/server.buzz.js'
export { removeEntity } from './buz/server.buzz.js'
export { intellectServer } from './buz/server.buzz.js'
export { visionServer } from './buz/server.buzz.js'

// ----- SOURCE: ..\..\packages\000.server\00.server.unit\server.model.ts -----
import type Server from './fce/server.interface.js'

export class ServerModel implements Server {
    // Not used in this implementation, but keeping the class structure
}

/**
 * The single source of truth for the active game session.
 * This acts as our in-memory database.
 */
export const gameState = {
    activeSession: {
        id: 'prototype-session-1',
        startTime: new Date().toISOString(),
    },
    players: {
        mock_player_1: {
            name: 'Kaelen',
            hp: 20,
            maxHp: 20,
            ac: 14,
        },
    },
    monsters: {
        monster_a: {
            name: 'Goblin',
            hp: 10,
            maxHp: 10,
            ac: 12,
        },
    },
    turnOrder: ['mock_player_1', 'monster_a'],
    currentTurnIndex: 0,
}

// ----- SOURCE: ..\..\packages\000.server\00.server.unit\server.reduce.ts -----
import clone from 'clone-deep'
import * as Act from './server.action.js'
import { ServerModel } from './server.model.js'
import * as Buzz from './server.buzzer.js'
import type State from '../99.core/state.js'

export function reducer(
    model: ServerModel = new ServerModel(),
    act: Act.Actions,
    state?: State,
) {
    switch (act.type) {
        case Act.UPDATE_SERVER:
            return Buzz.updateServer(clone(model), act.bale, state)

        case Act.INIT_SERVER:
            return Buzz.initServer(clone(model), act.bale, state)

        case Act.TEST_SERVER:
            return Buzz.testServer(clone(model), act.bale, state)

        case Act.INTELLECT_SERVER:
            return Buzz.intellectServer(clone(model), act.bale, state)

        case Act.VISION_SERVER:
            return Buzz.visionServer(clone(model), act.bale, state)

        default:
            return model
    }
}

// ----- SOURCE: ..\..\packages\000.server\00.server.unit\server.test.ts -----
import { describe, it, expect, vi } from 'vitest'
import { initServer } from './buz/server.buzz.js'
import { ServerModel } from './server.model.js'

describe('server', () => {
    it('should initialize server', () => {
        const model = new ServerModel()
        const state = {
            hunt: vi.fn().mockResolvedValue({}),
            dispatch: vi.fn(),
        } as any

        const slv = vi.fn()
        const bal = { idx: 'test', slv } as any

        // Check if initserver is a function and can be called
        expect(typeof initServer).toBe('function')

        const result = initServer(model, bal, state)
        expect(result).toBe(model)
        //expect(slv).toHaveBeenCalledWith({ intBit: { idx: 'init-server' } });
    })

    it('should wake up the server if url is provided', async () => {
        const model = new ServerModel()
        const state = {} as any
        const slv = vi.fn()
        const bal = { idx: 'test', slv } as any

        const urlserver = 'https://zero00-server.onrender.com/api/server/test'
        const urlSpace = 'https://zero00-server.onrender.com/api/space/test'

        const mockResponseserver = { status: 'server-awake' }
        const mockResponseSpace = { status: 'space-awake' }

        const globalFetch = vi
            .spyOn(global, 'fetch')
            .mockImplementation((url) => {
                if (url === urlserver) {
                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve(mockResponseserver),
                    } as any)
                }
                if (url === urlSpace) {
                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve(mockResponseSpace),
                    } as any)
                }
                return Promise.reject(new Error('Unknown URL'))
            })

        initServer(model, bal, state)

        // Wait for the promise in initserver to resolve
        await new Promise((resolve) => setTimeout(resolve, 0))

        expect(globalFetch).toHaveBeenCalledWith(urlserver)
        expect(globalFetch).toHaveBeenCalledWith(urlSpace)
        expect(slv).toHaveBeenCalledWith({
            intBit: {
                idx: 'init-server',
                dat: {
                    server: mockResponseserver,
                    space: mockResponseSpace,
                },
            },
        })

        globalFetch.mockRestore()
    })

    it('should handle fetch errors', async () => {
        const model = new ServerModel()
        const state = {} as any
        const slv = vi.fn()
        const bal = { idx: 'test', slv } as any

        const urlserver = 'https://zero00-server.onrender.com/api/server/test'
        const urlSpace = 'https://zero00-server.onrender.com/api/space/test'

        const errorMessage = 'Network error'
        const globalFetch = vi
            .spyOn(global, 'fetch')
            .mockImplementation((url) => {
                if (url === urlserver) {
                    return Promise.reject(new Error(errorMessage))
                }
                return Promise.resolve({
                    ok: true,
                    json: async () => ({}),
                } as any)
            })

        initServer(model, bal, state)

        // Wait for the promise in initserver to resolve
        await new Promise((resolve) => setTimeout(resolve, 0))

        expect(globalFetch).toHaveBeenCalledWith(urlserver)
        expect(globalFetch).toHaveBeenCalledWith(urlSpace)

        expect(slv).toHaveBeenCalledWith({
            intBit: { idx: 'init-server-err', dat: errorMessage },
        })

        globalFetch.mockRestore()
    })
})

// ----- SOURCE: ..\..\packages\000.server\00.server.unit\server.unit.ts -----
import type State from '../99.core/state.js'

export default class ServerUnit {
    constructor(state: State) {}
}
