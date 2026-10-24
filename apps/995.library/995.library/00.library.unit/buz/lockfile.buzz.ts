import fs from 'fs-extra'
import path from 'path'
import type { LibraryModel } from '../library.model'
import type LibraryBit from '../fce/library.bit'
import type State from '../../99.core/state'
import * as ActCns from '../../act/console.action'
import type { VersionsManifest } from '../fce/versions.interface'
import type {
    ConflictManifestAnalysis,
    ScratchpadMetadata,
} from '../fce/conflict.interface'

/**
 * Compares two manifest trees and returns a structured divergence analysis.
 */
export const analyzeManifestDivergence = (
    localManifest: VersionsManifest,
    remoteManifest: VersionsManifest,
): ConflictManifestAnalysis => {
    const analysis: ConflictManifestAnalysis = {
        hasDivergence: false,
        conflictCount: 0,
        conflicts: {},
    }

    const localRepos = localManifest.repositories || {}
    const remoteRepos = remoteManifest.repositories || {}
    const allRepoKeys = Array.from(new Set([...Object.keys(localRepos), ...Object.keys(remoteRepos)]))

    for (const key of allRepoKeys) {
        const local = localRepos[key]
        const remote = remoteRepos[key]

        const diffFields: string[] = []

        if (!local || !remote) {
            diffFields.push('existence')
        } else {
            if (local.pinned_sha !== remote.pinned_sha) diffFields.push('pinned_sha')
            if (local.required_contract_version !== remote.required_contract_version) diffFields.push('required_contract_version')
            if (local.expected_branch !== remote.expected_branch) diffFields.push('expected_branch')
            if (local.status !== remote.status) diffFields.push('status')
        }

        const hasConflict = diffFields.length > 0
        if (hasConflict) {
            analysis.hasDivergence = true
            analysis.conflictCount++
        }

        analysis.conflicts[key] = {
            repoKey: key,
            hasConflict,
            localConfig: local,
            remoteConfig: remote,
            diffFields,
        }
    }

    return analysis
}

/**
 * Synthesizes a three-way merge string format suitable for scratchpad staging.
 */
export const synthesizeConflictScratchpad = (analysis: ConflictManifestAnalysis): string => {
    let output = '{\n  "repositories": {\n'

    const keys = Object.keys(analysis.conflicts)
    keys.forEach((key, idx) => {
        const diff = analysis.conflicts[key]
        const isLast = idx === keys.length - 1

        if (diff.hasConflict) {
            const locShaShort = diff.localConfig?.pinned_sha?.substring(0, 10) || 'MISSING'
            const remShaShort = diff.remoteConfig?.pinned_sha?.substring(0, 10) || 'MISSING'

            output += `    "${key}": {\n`
            output += `      /* <<<<<<< LOCAL WORKSPACE PIN: ${locShaShort} */\n`
            if (diff.localConfig) {
                output += `      "pinned_sha": "${diff.localConfig.pinned_sha}",\n`
                output += `      "required_contract_version": "${diff.localConfig.required_contract_version}"\n`
            }
            output += `      /* ======= REMOTE SOVEREIGN PIN: ${remShaShort} */\n`
            if (diff.remoteConfig) {
                output += `      // "pinned_sha": "${diff.remoteConfig.pinned_sha}",\n`
                output += `      // "required_contract_version": "${diff.remoteConfig.required_contract_version}"\n`
            }
            output += `      /* >>>>>>> */\n`
            output += `    }${isLast ? '' : ','}\n`
        } else {
            output += `    "${key}": ${JSON.stringify(diff.localConfig, null, 2).split('\n').join('\n    ')}${isLast ? '' : ','}\n`
        }
    })

    output += '  }\n}\n'
    return output
}

/**
 * Stages a divergence analysis into an isolated scratchpad file.
 */
export const stageLockfileConflict = async (
    cpy: LibraryModel,
    bal: LibraryBit,
    ste: State,
): Promise<LibraryModel> => {
    const emit = async (msg: string) => {
        if (ste && typeof ste.hunt === 'function') {
            await ste.hunt(ActCns.UPDATE_CONSOLE, {
                idx: 'cns00',
                src: msg,
            }).catch(() => {})
        }
    }

    try {
        const dat = bal?.dat as any
        if (!dat || !dat.localManifest || !dat.remoteManifest) {
            throw new Error('Missing manifest payloads in stage dat buffer.')
        }

        const localManifest: VersionsManifest = dat.localManifest
        const remoteManifest: VersionsManifest = dat.remoteManifest
        const canonicalPath = bal?.src || path.resolve(process.cwd(), 'data', 'versions.json')

        await emit('>> [LOCKFILE_STAGE] Analyzing manifest divergence...')
        const analysis = analyzeManifestDivergence(localManifest, remoteManifest)

        if (!analysis.hasDivergence) {
            await emit('>> [LOCKFILE_STAGE] [OK] No conflict detected between manifests.')
            if (bal?.slv) {
                bal.slv({
                    libBit: {
                        idx: 'stage-lockfile-clean',
                        val: 0,
                        src: canonicalPath,
                    },
                })
            }
            return cpy
        }

        const nonce = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
        const targetDir = path.resolve(process.cwd(), 'data', 'lockfile')
        await fs.ensureDir(targetDir)

        const scratchpadPath = path.join(targetDir, `.tmp_versions_conflict_${nonce}.json`)
        const content = synthesizeConflictScratchpad(analysis)

        // Write to temporary buffer; canonical path is guaranteed untouched
        await fs.writeFile(scratchpadPath, content, 'utf8')

        const metadata: ScratchpadMetadata = {
            scratchpadPath,
            canonicalPath,
            nonce,
            timestamp: new Date().toISOString(),
            conflictCount: analysis.conflictCount,
            conflicts: Object.keys(analysis.conflicts).filter(
                (k) => analysis.conflicts[k].hasConflict,
            ),
        }

        await emit(`>> [LOCKFILE_STAGE] [OK] Staged ${analysis.conflictCount} conflict(s) to ${path.basename(scratchpadPath)}`)

        if (bal?.slv) {
            bal.slv({
                libBit: {
                    idx: 'stage-lockfile-conflict',
                    src: scratchpadPath,
                    val: analysis.conflictCount,
                    dat: metadata,
                },
            })
        }
    } catch (err: any) {
        await emit(`:: [FAIL] Stage conflict error: ${err.message}`)
        if (bal?.slv) {
            bal.slv({
                libBit: {
                    idx: 'stage-lockfile-conflict-error',
                    src: err.message,
                    val: -1,
                },
            })
        }
    }

    return cpy
}

/**
 * Purges an orphaned or completed temporary scratchpad file.
 */
export const purgeLockfileScratchpad = async (
    cpy: LibraryModel,
    bal: LibraryBit,
    ste: State,
): Promise<LibraryModel> => {
    const targetFile = bal?.src
    if (targetFile && (await fs.pathExists(targetFile))) {
        try {
            await fs.remove(targetFile)
            if (ste && typeof ste.hunt === 'function') {
                await ste.hunt(ActCns.UPDATE_CONSOLE, {
                    idx: 'cns00',
                    src: `>> [LOCKFILE_PURGE] [OK] Removed temporary scratchpad: ${path.basename(targetFile)}`,
                }).catch(() => {})
            }
            if (bal?.slv) {
                bal.slv({
                    libBit: {
                        idx: 'purge-lockfile-scratchpad',
                        src: targetFile,
                        val: 0,
                    },
                })
            }
        } catch (err: any) {
            if (bal?.slv) {
                bal.slv({
                    libBit: {
                        idx: 'purge-lockfile-scratchpad-error',
                        src: err.message,
                        val: -1,
                    },
                })
            }
        }
    } else {
        if (bal?.slv) {
            bal.slv({
                libBit: {
                    idx: 'purge-lockfile-scratchpad',
                    src: targetFile || '',
                    val: 0,
                },
            })
        }
    }

    return cpy
}
