import { describe, it, expect } from 'vitest'
import {
    parseAskJulesMessage,
    resolveFleetRepo,
    type WatchedRepo,
} from '../../src/pathNormalizer.js'

describe('Path Normalizer & Slack #ask-jules Parser', () => {
    const mockFleet: WatchedRepo[] = [
        {
            id: 'camp-candor/000.repo-bot',
            owner: 'camp-candor',
            repo: '000.repo-bot',
            url: 'https://github.com/camp-candor/000.repo-bot',
        },
        {
            id: 'astro-kahn-it-com/001.goblin-lore',
            owner: 'astro-kahn-it-com',
            repo: '001.goblin-lore',
            url: 'https://github.com/astro-kahn-it-com/001.goblin-lore',
        },
    ]

    it('splits message text on first colon into raw path and prompt', () => {
        const input =
            'PS D:\\arte\\work\\campc-it-com\\000.repo-bot> : execute [data/directive/014.ag-check.md]'
        const parsed = parseAskJulesMessage(input)

        expect(parsed).not.toBeNull()
        expect(parsed?.rawPath).toBe(
            'PS D:\\arte\\work\\campc-it-com\\000.repo-bot>',
        )
        expect(parsed?.prompt).toBe('execute [data/directive/014.ag-check.md]')
    })

    it('returns null if no colon exists or prompt is empty', () => {
        expect(parseAskJulesMessage('000.repo-bot execute task')).toBeNull()
        expect(parseAskJulesMessage('000.repo-bot : ')).toBeNull()
    })

    it('normalizes PowerShell prompt paths to fleet repo', () => {
        const result = resolveFleetRepo(
            'PS D:\\arte\\work\\campc-it-com\\000.repo-bot>',
            mockFleet,
        )
        expect(result).not.toBeNull()
        expect(result?.id).toBe('camp-candor/000.repo-bot')
    })

    it('normalizes Windows monorepo subpaths with /apps to root repo', () => {
        const result = resolveFleetRepo(
            'D:\\arte\\work\\campc-it-com\\000.repo-bot\\apps',
            mockFleet,
        )
        expect(result?.id).toBe('camp-candor/000.repo-bot')
    })

    it('resolves direct GitHub URLs', () => {
        const result = resolveFleetRepo(
            'https://github.com/astro-kahn-it-com/001.goblin-lore',
            mockFleet,
        )
        expect(result?.id).toBe('astro-kahn-it-com/001.goblin-lore')
    })

    it('resolves short repo names', () => {
        const result = resolveFleetRepo('001.goblin-lore', mockFleet)
        expect(result?.id).toBe('astro-kahn-it-com/001.goblin-lore')
    })

    it('returns null when input does not match any fleet repo', () => {
        const result = resolveFleetRepo(
            'D:\\unknown\\random-project',
            mockFleet,
        )
        expect(result).toBeNull()
    })
})
