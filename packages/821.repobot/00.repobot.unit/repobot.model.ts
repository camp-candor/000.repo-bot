import repobot from './fce/repobot.interface.js'

export class RepobotModel implements repobot {
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
