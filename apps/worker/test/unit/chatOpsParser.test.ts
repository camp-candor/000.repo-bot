import { describe, it, expect } from 'vitest'
import { parseSlashCommand } from '../../src/telemetry/chatOpsParser.js'

describe('Lexical Parsing & Slash Command Taxonomy Battery (Phase 2)', () => {
    it('TASK-2.1: strips prefix and identifies root actions and taskId targets', () => {
        const cmdStatus = parseSlashCommand(
            '/repo-bot status shot-001',
            'operator_alpha',
        )
        expect(cmdStatus.action).toBe('STATUS')
        expect(cmdStatus.taskId).toBe('shot-001')
        expect(cmdStatus.operatorId).toBe('operator_alpha')

        const cmdFleet = parseSlashCommand('/repo-bot fleet', 'operator_beta')
        expect(cmdFleet.action).toBe('FLEET')
        expect(cmdFleet.taskId).toBeUndefined()
        expect(cmdFleet.operatorId).toBe('operator_beta')
    })

    it('TASK-2.1: operates case-insensitively on action verbs', () => {
        const cmd = parseSlashCommand(
            'oVeRriDe shot-002 --seed 123',
            'operator_1',
        )
        expect(cmd.action).toBe('OVERRIDE')
        expect(cmd.taskId).toBe('shot-002')
        expect(cmd.seed).toBe(123)
    })

    it('TASK-2.2: extracts quoted multi-word flag values cleanly', () => {
        const raw =
            '/repo-bot override shot-003 --prompt "A cinematic rendering of a castle" --reason "Color correction" --seed 456'
        const cmd = parseSlashCommand(raw, 'operator_jules')

        expect(cmd.action).toBe('OVERRIDE')
        expect(cmd.positivePrompt).toBe('A cinematic rendering of a castle')
        expect(cmd.reason).toBe('Color correction')
        expect(cmd.seed).toBe(456)
    })

    it('TASK-2.2: unescapes nested quotes within string flags', () => {
        const raw =
            '/repo-bot override shot-004 --prompt "A knight wearing \\"heavy\\" armor"'
        const cmd = parseSlashCommand(raw, 'operator_jules')

        expect(cmd.action).toBe('OVERRIDE')
        expect(cmd.positivePrompt).toBe('A knight wearing "heavy" armor')
    })

    it('TASK-2.3: throws COMMAND_PARSE_ERROR if operatorId is omitted or whitespace', () => {
        expect(() => {
            parseSlashCommand('/repo-bot fleet', '')
        }).toThrow(
            'COMMAND_PARSE_ERROR: Operator identity (operatorId) is mandatory',
        )

        expect(() => {
            parseSlashCommand('/repo-bot status shot-001', '   ')
        }).toThrow(
            'COMMAND_PARSE_ERROR: Operator identity (operatorId) is mandatory',
        )
    })

    it('TASK-2.3: throws COMMAND_PARSE_ERROR if taskId is missing for target-dependent actions', () => {
        expect(() => {
            parseSlashCommand(
                '/repo-bot override --prompt "missing task"',
                'operator_1',
            )
        }).toThrow(/Missing mandatory taskId/)

        expect(() => {
            parseSlashCommand('/repo-bot abort', 'operator_1')
        }).toThrow(/Missing mandatory taskId/)
    })

    it('TASK-2.3: throws COMMAND_PARSE_ERROR for unrecognized action verbs', () => {
        expect(() => {
            parseSlashCommand('/repo-bot hack shot-001', 'operator_1')
        }).toThrow(/Unknown action 'HACK'/)
    })

    it('TASK-2.2: strictly casts numeric fields and allows decimal denoise strength', () => {
        const raw = 'override shot-005 --seed 8841 --denoise 0.45'
        const cmd = parseSlashCommand(raw, 'operator_1')

        expect(cmd.seed).toBe(8841)
        expect(cmd.denoiseStrength).toBe(0.45)
        expect(typeof cmd.denoiseStrength).toBe('number')
    })

    describe('6 Non-Negotiable Lexical Parsing Invariants (Gauntlet Level 3)', () => {
        it('Invariant 1: Prefix stripping and case-insensitive action routing', () => {
            const cmd1 = parseSlashCommand('/repo-bot sTaTuS shot-001', 'op-1')
            expect(cmd1.action).toBe('STATUS')
            expect(cmd1.taskId).toBe('shot-001')

            const cmd2 = parseSlashCommand('oVeRriDe shot-002', 'op-2')
            expect(cmd2.action).toBe('OVERRIDE')
            expect(cmd2.taskId).toBe('shot-002')
        })

        it('Invariant 2: Strict operator attribution rejection with whitespace', () => {
            expect(() => {
                parseSlashCommand('/repo-bot status shot-001', '   ')
            }).toThrow(
                'COMMAND_PARSE_ERROR: Operator identity (operatorId) is mandatory',
            )
        })

        it('Invariant 3: Missing target fencing on target-dependent commands while global FLEET succeeds', () => {
            expect(() => {
                parseSlashCommand(
                    '/repo-bot override --prompt "missing task"',
                    'op-1',
                )
            }).toThrow(/COMMAND_PARSE_ERROR: Missing mandatory taskId/)

            const fleet = parseSlashCommand('/repo-bot fleet', 'op-1')
            expect(fleet.action).toBe('FLEET')
        })

        it('Invariant 4: Multi-word quoted string extraction without whitespace fragmentation', () => {
            const raw =
                '/repo-bot override shot-003 --prompt "A cinematic rendering of a castle" --reason "Color correction"'
            const cmd = parseSlashCommand(raw, 'op-1')
            expect(cmd.positivePrompt).toBe('A cinematic rendering of a castle')
            expect(cmd.reason).toBe('Color correction')
        })

        it('Invariant 5: Nested quote unescaping preserving internal quotes while stripping enclosing', () => {
            const raw =
                '/repo-bot override shot-004 --prompt "A knight wearing \\"heavy\\" armor"'
            const cmd = parseSlashCommand(raw, 'op-1')
            expect(cmd.positivePrompt).toBe('A knight wearing "heavy" armor')
        })

        it('Invariant 6: Numeric flag casting validation', () => {
            const raw = 'override shot-005 --seed 8841 --denoise 0.45'
            const cmd = parseSlashCommand(raw, 'op-1')
            expect(cmd.seed).toBe(8841)
            expect(cmd.denoiseStrength).toBe(0.45)
            expect(typeof cmd.seed).toBe('number')
            expect(typeof cmd.denoiseStrength).toBe('number')
        })
    })
})
