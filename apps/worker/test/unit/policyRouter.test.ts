import { describe, it, expect } from 'vitest'
import {
    classifyFileRisk,
    classifyDiffRisk,
    inspectLifecyclePragmas,
} from '../../src/policyRouter.js'

describe('FEAT-03: Path-Sensitivity Classifier & Policy Router', () => {
    describe('1. Individual File Classification', () => {
        it('identifies Class 0 (Forbidden) files', () => {
            expect(classifyFileRisk('.github/workflows/ci.yml').riskClass).toBe(
                'CLASS_0_FORBIDDEN',
            )
            expect(classifyFileRisk('tests/invariants.test.ts').riskClass).toBe(
                'CLASS_0_FORBIDDEN',
            )
            expect(classifyFileRisk('package.json').riskClass).toBe(
                'CLASS_0_FORBIDDEN',
            )
            expect(classifyFileRisk('tsconfig.json').riskClass).toBe(
                'CLASS_0_FORBIDDEN',
            )
        })

        it('identifies Class 1 (High-Risk / Creative) files by pattern', () => {
            expect(classifyFileRisk('characters/bog.md').riskClass).toBe(
                'CLASS_1_HIGH_RISK',
            )
            expect(classifyFileRisk('world/factions.md').riskClass).toBe(
                'CLASS_1_HIGH_RISK',
            )
            expect(classifyFileRisk('grievances/hoarding.md').riskClass).toBe(
                'CLASS_1_HIGH_RISK',
            )
            expect(classifyFileRisk('scenes/ep101.json').riskClass).toBe(
                'CLASS_1_HIGH_RISK',
            )
            expect(classifyFileRisk('Dockerfile').riskClass).toBe(
                'CLASS_1_HIGH_RISK',
            )
            expect(classifyFileRisk('requirements.txt').riskClass).toBe(
                'CLASS_1_HIGH_RISK',
            )
        })

        it('identifies Class 2 (Low-Risk / Deterministic) files by pattern', () => {
            expect(classifyFileRisk('src/utils/math.ts').riskClass).toBe(
                'CLASS_2_LOW_RISK',
            )
            expect(classifyFileRisk('src/types/scene.ts').riskClass).toBe(
                'CLASS_2_LOW_RISK',
            )
            expect(classifyFileRisk('compiled/manifest.json').riskClass).toBe(
                'CLASS_2_LOW_RISK',
            )
        })

        it('elevates unlisted files to Class 1 (Fail-High policy)', () => {
            expect(
                classifyFileRisk('src/components/button.tsx').riskClass,
            ).toBe('CLASS_1_HIGH_RISK')
        })

        it('handles case-insensitivity cleanly', () => {
            expect(classifyFileRisk('CHARACTERS/spleen.md').riskClass).toBe(
                'CLASS_1_HIGH_RISK',
            )
            expect(classifyFileRisk('World/lore.md').riskClass).toBe(
                'CLASS_1_HIGH_RISK',
            )
        })
    })

    describe('2. Lifecycle Pragma Inspections', () => {
        it('detects locked and generated pragmas', () => {
            expect(
                inspectLifecyclePragmas('// @lifecycle: locked').isLocked,
            ).toBe(true)
            expect(
                inspectLifecyclePragmas('// @lifecycle: generated').isGenerated,
            ).toBe(true)
            expect(
                inspectLifecyclePragmas('// Standard code comment').isLocked,
            ).toBe(false)
        })

        it('elevates files with @lifecycle: locked to Class 1 even on low-risk paths', () => {
            const res = classifyFileRisk(
                'src/utils/cameraCurve.ts',
                null,
                '// @lifecycle: locked\nexport const speed = 1.0;',
            )
            expect(res.riskClass).toBe('CLASS_1_HIGH_RISK')
            expect(res.hasLockedPragma).toBe(true)
        })

        it('allows @lifecycle: generated to qualify an unclassified file as Class 2', () => {
            const res = classifyFileRisk(
                'src/scenes/generated_manifest.ts',
                null,
                '// @lifecycle: generated\nexport const frame = 24;',
            )
            expect(res.riskClass).toBe('CLASS_2_LOW_RISK')
            expect(res.hasGeneratedPragma).toBe(true)
        })
    })

    describe('3. Aggregate Diff Evaluation (Fail-High Join Rule)', () => {
        it('classifies a purely deterministic diff as Low-Risk', () => {
            const diff = [
                {
                    filename: 'src/utils/math.ts',
                    status: 'modified',
                    additions: 1,
                    deletions: 1,
                    changes: 2,
                },
                {
                    filename: 'src/types/payload.ts',
                    status: 'modified',
                    additions: 4,
                    deletions: 0,
                    changes: 4,
                },
                {
                    filename: 'compiled/manifest.json',
                    status: 'modified',
                    additions: 10,
                    deletions: 10,
                    changes: 20,
                },
            ]

            const result = classifyDiffRisk(diff)
            expect(result.isHighRiskPath).toBe(false)
            expect(result.dominantClass).toBe('CLASS_2_LOW_RISK')
        })

        it('escalates to High-Risk if even one file in a large diff is Class 1', () => {
            const diff = [
                {
                    filename: 'src/utils/math.ts',
                    status: 'modified',
                    additions: 1,
                    deletions: 1,
                    changes: 2,
                },
                {
                    filename: 'src/types/payload.ts',
                    status: 'modified',
                    additions: 4,
                    deletions: 0,
                    changes: 4,
                },
                {
                    filename: 'characters/bog.md',
                    status: 'modified',
                    additions: 2,
                    deletions: 1,
                    changes: 3,
                },
            ]

            const result = classifyDiffRisk(diff)
            expect(result.isHighRiskPath).toBe(true)
            expect(result.dominantClass).toBe('CLASS_1_HIGH_RISK')
        })

        it('tags dominant class as CLASS_0_FORBIDDEN if a protected file is touched', () => {
            const diff = [
                {
                    filename: 'src/utils/math.ts',
                    status: 'modified',
                    additions: 1,
                    deletions: 1,
                    changes: 2,
                },
                {
                    filename: 'package.json',
                    status: 'modified',
                    additions: 1,
                    deletions: 0,
                    changes: 1,
                },
            ]

            const result = classifyDiffRisk(diff)
            expect(result.isHighRiskPath).toBe(true)
            expect(result.dominantClass).toBe('CLASS_0_FORBIDDEN')
        })
    })
})
