import Gemini from './fce/gemini.interface.js'

export class GeminiModel implements Gemini {
    targetUrl =
        'https://gemini.google.com/notebook/25fcd56e-a95d-46f8-9b11-c9bace81da4b'
    hydrationDelayMs = 2800
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
