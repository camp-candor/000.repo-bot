import * as ActCns from '../../83.console.unit/console.action'
import type { DirectiveModel } from '../directive.model'
import type DirectiveBit from '../fce/directive.bit'
import type State from '../../99.core/state'

const slugify = require('slugify')

const pad3 = (num: number): string => String(num).padStart(3, '0')

/**
 * Normalizes a raw focus label string into a clean URL/filename-safe slug.
 * Transforms whitespace, underscores, and special characters into hyphens.
 */
export const toSlug = (raw: string): string => {
    if (!raw) return 'focus'
    const manual =
        raw
            .toLowerCase()
            .trim()
            .replace(/[\s_]+/g, '-')
            .replace(/[^a-z0-9-]/g, '')
            .replace(/-+/g, '-')
            .replace(/^-+|-+$/g, '') || 'focus'
    try {
        let cleanRaw = raw.replace(/_/g, '-').replace(/[^a-zA-Z0-9 -]/g, '')
        const slug = slugify(cleanRaw, {
            lower: true,
            strict: true,
            trim: true,
        })
        if (slug && slug.length > 0) return slug
    } catch {}
    return manual
}

const isRepoRoot = (dir: string): boolean => {
    const fs = require('fs')
    const path = require('path')
    try {
        return (
            fs.existsSync(path.join(dir, 'apps')) &&
            fs.existsSync(path.join(dir, 'packages')) &&
            fs.existsSync(path.join(dir, 'package.json'))
        )
    } catch {
        return false
    }
}

const findRepoRoot = (startDir: string = process.cwd()): string => {
    const path = require('path')
    let curr = path.resolve(startDir)
    while (curr && curr !== path.dirname(curr)) {
        if (isRepoRoot(curr)) return curr
        curr = path.dirname(curr)
    }
    return process.cwd()
}

export const initDirective = (
    cpy: DirectiveModel,
    _bal: DirectiveBit,
    _ste: State,
) => {
    return cpy
}

export const updateDirective = (
    cpy: DirectiveModel,
    _bal: DirectiveBit,
    _ste: State,
) => {
    return cpy
}

const PHASE_WORDS: Record<number, string> = {
    1: 'one',
    2: 'two',
    3: 'three',
    4: 'four',
    5: 'five',
    6: 'six',
    7: 'seven',
    8: 'eight',
    9: 'nine',
    10: 'ten',
    11: 'eleven',
    12: 'twelve',
    13: 'thirteen',
    14: 'fourteen',
    15: 'fifteen',
    16: 'sixteen',
    17: 'seventeen',
    18: 'eighteen',
    19: 'nineteen',
    20: 'twenty',
}

const WORD_TO_PHASE: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
    thirteen: 13,
    fourteen: 14,
    fifteen: 15,
    sixteen: 16,
    seventeen: 17,
    eighteen: 18,
    nineteen: 19,
    twenty: 20,
}

const getPhaseWord = (num: number): string => PHASE_WORDS[num] || String(num)

const parsePhaseWord = (word: string): number => {
    const lower = word.toLowerCase().trim()
    if (WORD_TO_PHASE[lower] != null) return WORD_TO_PHASE[lower]
    const parsed = parseInt(lower, 10)
    return isNaN(parsed) ? 1 : parsed
}

export const createDirective = async (
    cpy: DirectiveModel,
    bal: DirectiveBit,
    ste: State,
): Promise<DirectiveModel> => {
    const fs = require('fs-extra')
    const path = require('path')

    const repoRoot = findRepoRoot()
    const targetDay = (bal?.src || 'day-000').replace(/[[\]]/g, '').trim()
    const rawLabel = (bal?.idx || 'focus').trim()
    const slugLabel = toSlug(rawLabel)
    const phaseCount = typeof bal?.val === 'number' && bal.val > 0 ? bal.val : 1

    const targetDayDir = path.join(repoRoot, 'data', 'directive', targetDay)
    const templateDayDir = path.join(repoRoot, 'data', 'directive', 'day-000')

    try {
        await fs.ensureDir(targetDayDir)

        if (ste) {
            await ste.hunt(ActCns.UPDATE_CONSOLE, {
                idx: 'cns00',
                src: `>> [DIRECTIVE] Scaffolding stack in ${targetDay} (${phaseCount} phases)...`,
            })
        }

        // 1. Calculate the next monotonic sequential index prefix
        const existingEntries = await fs.readdir(targetDayDir)
        let maxPrefix = -1

        for (const entry of existingEntries) {
            const match = entry.match(/^(\d{3})\./)
            if (match) {
                const num = parseInt(match[1], 10)
                if (num > maxPrefix) {
                    maxPrefix = num
                }
            }
        }

        let currentSeq = maxPrefix + 1
        const createdFiles: string[] = []

        const readTemplateContent = async (
            baseNames: string[],
        ): Promise<string> => {
            const searchDirs = [templateDayDir, targetDayDir]
            for (const dir of searchDirs) {
                for (const baseName of baseNames) {
                    const candidate = path.join(dir, baseName)
                    if (await fs.pathExists(candidate)) {
                        return await fs.readFile(candidate, 'utf8')
                    }
                }
            }
            return ''
        }

        // 2. Provision the focus divider (.cpn)
        const focusTemplateContent = await readTemplateContent([
            '000.focus.cpn',
            'focus.cpn',
        ])

        const dividerFileName = `${pad3(currentSeq)}.${slugLabel}.cpn`
        const dividerFilePath = path.join(targetDayDir, dividerFileName)
        await fs.writeFile(dividerFilePath, focusTemplateContent, 'utf8')
        createdFiles.push(dividerFileName)

        if (ste) {
            await ste.hunt(ActCns.UPDATE_CONSOLE, {
                idx: 'cns00',
                src: `>> [OK] writing data/directive/${targetDay}/${dividerFileName}`,
            })
        }

        // 3. Read base templates for Jules and Gravity/AG-Test pairs
        const julesTemplateContent = await readTemplateContent([
            '000.xxxx.jules.md',
            '000.xxxx.jules',
            '000.jules.md',
        ])

        const gravityTemplateContent = await readTemplateContent([
            '000.xxxxx.gravity.md',
            '000.xxxxx.gravity',
            '000.xxxxx.ag-test.md',
            '000.xxxxx.ag-test',
        ])

        let checkExt = 'gravity.md'
        if (
            (await fs.pathExists(
                path.join(templateDayDir, '000.xxxxx.ag-test.md'),
            )) &&
            !(await fs.pathExists(
                path.join(templateDayDir, '000.xxxxx.gravity.md'),
            ))
        ) {
            checkExt = 'ag-test.md'
        }

        // 4. Provision sequential phase pairs
        for (let p = 1; p <= phaseCount; p++) {
            const phaseWord = getPhaseWord(p)

            currentSeq++
            const julesFileName = `${pad3(currentSeq)}.phase-${phaseWord}.jules.md`
            const julesFilePath = path.join(targetDayDir, julesFileName)
            await fs.writeFile(julesFilePath, julesTemplateContent, 'utf8')
            createdFiles.push(julesFileName)

            if (ste) {
                await ste.hunt(ActCns.UPDATE_CONSOLE, {
                    idx: 'cns00',
                    src: `>> [OK] writing data/directive/${targetDay}/${julesFileName}`,
                })
            }

            currentSeq++
            const gravityFileName = `${pad3(currentSeq)}.phase-${phaseWord}.${checkExt}`
            const gravityFilePath = path.join(targetDayDir, gravityFileName)
            await fs.writeFile(gravityFilePath, gravityTemplateContent, 'utf8')
            createdFiles.push(gravityFileName)

            if (ste) {
                await ste.hunt(ActCns.UPDATE_CONSOLE, {
                    idx: 'cns00',
                    src: `>> [OK] writing data/directive/${targetDay}/${gravityFileName}`,
                })
            }
        }

        const relOutput = path
            .relative(repoRoot, targetDayDir)
            .replace(/\\/g, '/')

        if (ste) {
            await ste.hunt(ActCns.UPDATE_CONSOLE, {
                idx: 'cns00',
                src: `>> [OK] Directive stack created in ${relOutput} (${createdFiles.length} files).`,
            })
        }

        if (bal && bal.slv != null) {
            bal.slv({
                drtBit: {
                    idx: 'create-directive',
                    src: relOutput,
                    val: createdFiles.length,
                    dat: {
                        targetDay,
                        label: slugLabel,
                        files: createdFiles,
                    },
                },
            })
        }
    } catch (err: any) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        if (ste) {
            await ste.hunt(ActCns.UPDATE_CONSOLE, {
                idx: 'cns00',
                src: `:: [FAIL] Error in createDirective: ${errorMsg}`,
            })
        }
        if (bal && bal.slv != null) {
            bal.slv({
                drtBit: {
                    idx: 'create-directive-error',
                    src: errorMsg,
                },
            })
        }
    }

    return cpy
}

export const dayDirective = async (
    cpy: DirectiveModel,
    bal: DirectiveBit,
    ste: State,
): Promise<DirectiveModel> => {
    const fs = require('fs-extra')
    const path = require('path')

    const repoRoot = findRepoRoot()
    const directiveRootDir = path.join(repoRoot, 'data', 'directive')

    try {
        await fs.ensureDir(directiveRootDir)

        const entries = await fs.readdir(directiveRootDir, {
            withFileTypes: true,
        })
        let maxIndex = -1

        for (const entry of entries) {
            if (!entry.isDirectory()) continue
            const match = entry.name.match(/^day-(\d+)$/i)
            if (match) {
                const num = parseInt(match[1], 10)
                if (num > maxIndex) {
                    maxIndex = num
                }
            }
        }

        const nextIndex = maxIndex + 1
        const daySlug = `day-${String(nextIndex).padStart(3, '0')}`
        const targetDayDir = path.join(directiveRootDir, daySlug)

        if (ste) {
            await ste.hunt(ActCns.UPDATE_CONSOLE, {
                idx: 'cns00',
                src: `>> [DIRECTIVE] Provisioning shift ${daySlug}...`,
            })
        }

        await fs.ensureDir(targetDayDir)

        const templateFiles = [
            '000.focus.cpn',
            '000.xxxx.jules',
            '000.xxxxx.ag-test',
            '000.xxxxx.gravity',
        ]

        for (const filename of templateFiles) {
            const destPath = path.join(targetDayDir, filename)
            await fs.writeFile(destPath, '', 'utf8')
            if (ste) {
                await ste.hunt(ActCns.UPDATE_CONSOLE, {
                    idx: 'cns00',
                    src: `>> [OK] writing data/directive/${daySlug}/${filename}`,
                })
            }
        }

        const filesToCopy = ['800.refinement.cpn', '900.check-list.cpn']

        for (const filename of filesToCopy) {
            const srcPath = path.join(directiveRootDir, 'day-000', filename)
            const destPath = path.join(targetDayDir, filename)
            const isSelf = path.resolve(srcPath) === path.resolve(destPath)

            if (await fs.pathExists(srcPath)) {
                if (!isSelf) {
                    await fs.copyFile(srcPath, destPath)
                }
            } else {
                await fs.writeFile(destPath, '', 'utf8')
            }

            if (ste) {
                await ste.hunt(ActCns.UPDATE_CONSOLE, {
                    idx: 'cns00',
                    src: isSelf
                        ? `>> [OK] writing data/directive/${daySlug}/${filename}`
                        : `>> [OK] copying data/directive/${daySlug}/${filename}`,
                })
            }
        }

        const relOutput = path
            .relative(repoRoot, targetDayDir)
            .replace(/\\/g, '/')

        if (ste) {
            await ste.hunt(ActCns.UPDATE_CONSOLE, {
                idx: 'cns00',
                src: `>> [OK] Successfully created directive shift: ${relOutput}`,
            })
        }

        if (bal && bal.slv != null) {
            bal.slv({
                drtBit: {
                    idx: 'day-directive',
                    src: relOutput,
                    val: nextIndex,
                    dat: {
                        dayFolder: daySlug,
                        files: [...templateFiles, ...filesToCopy],
                    },
                },
                dayBit: {
                    idx: daySlug,
                },
            })
        }
    } catch (err: any) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        if (ste) {
            await ste.hunt(ActCns.UPDATE_CONSOLE, {
                idx: 'cns00',
                src: `:: [FAIL] Error in dayDirective: ${errorMsg}`,
            })
        }
        if (bal && bal.slv != null) {
            bal.slv({
                drtBit: {
                    idx: 'day-directive-error',
                    src: errorMsg,
                },
            })
        }
    }

    return cpy
}

export const phaseDirective = async (
    cpy: DirectiveModel,
    bal: DirectiveBit,
    ste: State,
): Promise<DirectiveModel> => {
    const fs = require('fs-extra')
    const path = require('path')

    const repoRoot = findRepoRoot()
    const targetDay = (bal?.src || bal?.idx || 'day-004')
        .replace(/[[\]]/g, '')
        .trim()
    const targetDayDir = path.join(repoRoot, 'data', 'directive', targetDay)
    const templateDayDir = path.join(repoRoot, 'data', 'directive', 'day-000')

    try {
        await fs.ensureDir(targetDayDir)

        if (ste) {
            await ste.hunt(ActCns.UPDATE_CONSOLE, {
                idx: 'cns00',
                src: `>> [PHASE] Scanning ${targetDay} for sequential phase extension...`,
            })
        }

        const entries = await fs.readdir(targetDayDir)

        // 1. Calculate highest overall numeric prefix in directory
        let maxPrefix = -1
        let highestPhaseFilePrefix = -1
        let lastPhaseWord = ''

        for (const filename of entries) {
            const prefixMatch = filename.match(/^(\d{3})\./)
            if (prefixMatch) {
                const prefixNum = parseInt(prefixMatch[1], 10)
                if (prefixNum > maxPrefix) {
                    maxPrefix = prefixNum
                }

                // Check if this file represents a phase directive
                const phaseMatch = filename.match(
                    /^(\d{3})\.phase-([a-zA-Z0-9]+)\./i,
                )
                if (phaseMatch) {
                    if (prefixNum > highestPhaseFilePrefix) {
                        highestPhaseFilePrefix = prefixNum
                        lastPhaseWord = phaseMatch[2]
                    }
                }
            }
        }

        // 2. Derive next phase number and word
        let nextPhaseNum = 1
        if (highestPhaseFilePrefix !== -1 && lastPhaseWord) {
            const prevPhaseVal = parsePhaseWord(lastPhaseWord)
            nextPhaseNum = prevPhaseVal + 1
        }
        const nextPhaseWord = getPhaseWord(nextPhaseNum)

        // 3. Resolve template contents
        const readTemplate = async (candidates: string[]): Promise<string> => {
            const searchLocations = [templateDayDir, targetDayDir]
            for (const loc of searchLocations) {
                for (const name of candidates) {
                    const candidatePath = path.join(loc, name)
                    if (await fs.pathExists(candidatePath)) {
                        return await fs.readFile(candidatePath, 'utf8')
                    }
                }
            }
            return ''
        }

        const julesTemplate = await readTemplate([
            '000.xxxx.jules.md',
            '000.xxxx.jules',
            '000.jules.md',
        ])

        const agTestTemplate = await readTemplate([
            '000.xxxxx.ag-test.md',
            '000.xxxxx.ag-test',
            '000.xxxxx.gravity.md',
            '000.xxxxx.gravity',
        ])

        // 4. Provision File 1: *.jules.md
        const nextSeq1 = maxPrefix + 1
        const julesFilename = `${pad3(nextSeq1)}.phase-${nextPhaseWord}.jules.md`
        const julesFilePath = path.join(targetDayDir, julesFilename)
        await fs.writeFile(julesFilePath, julesTemplate, 'utf8')

        if (ste) {
            await ste.hunt(ActCns.UPDATE_CONSOLE, {
                idx: 'cns00',
                src: `>> [OK] writing data/directive/${targetDay}/${julesFilename}`,
            })
        }

        // 5. Provision File 2: *.ag-test.md
        const nextSeq2 = nextSeq1 + 1
        const agTestFilename = `${pad3(nextSeq2)}.phase-${nextPhaseWord}.ag-test.md`
        const agTestFilePath = path.join(targetDayDir, agTestFilename)
        await fs.writeFile(agTestFilePath, agTestTemplate, 'utf8')

        if (ste) {
            await ste.hunt(ActCns.UPDATE_CONSOLE, {
                idx: 'cns00',
                src: `>> [OK] writing data/directive/${targetDay}/${agTestFilename}`,
            })
        }

        const relDay = path.relative(repoRoot, targetDayDir).replace(/\\/g, '/')

        if (ste) {
            await ste.hunt(ActCns.UPDATE_CONSOLE, {
                idx: 'cns00',
                src: `>> [OK] Appended phase-${nextPhaseWord} pair to ${relDay}`,
            })
        }

        if (bal && bal.slv != null) {
            bal.slv({
                drtBit: {
                    idx: 'phase-directive',
                    src: relDay,
                    val: nextPhaseNum,
                    dat: {
                        targetDay,
                        phaseWord: nextPhaseWord,
                        files: [julesFilename, agTestFilename],
                    },
                },
                phaseBit: {
                    idx: `phase-${nextPhaseWord}`,
                    val: nextPhaseNum,
                    src: relDay,
                },
            })
        }
    } catch (err: any) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        if (ste) {
            await ste.hunt(ActCns.UPDATE_CONSOLE, {
                idx: 'cns00',
                src: `:: [FAIL] Error in phaseDirective: ${errorMsg}`,
            })
        }
        if (bal && bal.slv != null) {
            bal.slv({
                drtBit: { idx: 'phase-directive-error', src: errorMsg },
                phaseBit: { idx: 'phase-directive-error', src: errorMsg },
            })
        }
    }

    return cpy
}
