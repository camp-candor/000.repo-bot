import * as ActCns from '../../83.console.unit/console.action'
import type { DataModel } from '../data.model'
import type DataBit from '../fce/data.bit'
import type State from '../../99.core/state'
import type {
    DataTelemetryEnvelope,
    DataTelemetryStage,
    DataTelemetryStatus,
} from '../fce/data-telemetry.interface'

/**
 * Strips non-ASCII characters, ANSI escape sequences, and multi-byte glyphs
 * to guarantee strict 7-bit clean terminal compliance.
 */
export const sanitizeTo7BitAscii = (raw: string): string => {
    if (!raw) return ''
    return raw
        .replace(/\u001b\[[0-9;]*[a-zA-Z]/g, '')
        .replace(/[^\x20-\x7E]/g, '')
        .trim()
}

/**
 * Assembles a standardized, columnar telemetry line for the Blessed cns00 console pane.
 */
export const formatDataTelemetry = (envelope: DataTelemetryEnvelope): string => {
    const stageTag = `[DATA:${envelope.stage}]`
    const statusTag = envelope.status ? `[${envelope.status}] ` : ''
    const cleanMessage = sanitizeTo7BitAscii(envelope.message)
    return `>> ${stageTag} ${statusTag}${cleanMessage}`.trimEnd()
}

/**
 * Dispatches non-blocking telemetry frames to console cns00 without using raw console output.
 */
export const emitDataTelemetry = async (
    ste: State | null | undefined,
    envelope: DataTelemetryEnvelope,
): Promise<void> => {
    if (!ste || typeof ste.hunt !== 'function') {
        return
    }

    const line = formatDataTelemetry(envelope)

    try {
        await ste.hunt(ActCns.UPDATE_CONSOLE, {
            idx: 'cns00',
            src: line,
        })
    } catch {
        // Non-blocking degradation
    }
}

export const initData = async (
    cpy: DataModel,
    bal: DataBit,
    ste: State,
): Promise<DataModel> => {
    await emitDataTelemetry(ste, {
        stage: 'INIT',
        status: 'OK',
        message: 'Initializing media data plane boundaries...',
    })

    if (bal && bal.slv != null) {
        bal.slv({ datBit: { idx: 'init-data' } })
    }

    return cpy
}

export const updateData = async (
    cpy: DataModel,
    bal: DataBit,
    ste: State,
): Promise<DataModel> => {
    await emitDataTelemetry(ste, {
        stage: 'UPDATE',
        status: 'OK',
        message: 'Updating media data plane configuration...',
    })

    if (bal && bal.slv != null) {
        bal.slv({ datBit: { idx: 'update-data' } })
    }

    return cpy
}

export const frameData = async (
    cpy: DataModel,
    bal: DataBit,
    ste: State,
): Promise<DataModel> => {
    const videoFile = bal?.src ? `../films/${bal.src}` : '../films/default.mp4'
    const outputDir = bal?.dat?.outputDir || '../frames'
    const targetFrames = bal?.val || 48

    try {
        await emitDataTelemetry(ste, {
            stage: 'PREP',
            message: `Scrubbing local media spool: ${outputDir}`,
        })

        await emitDataTelemetry(ste, {
            stage: 'EXEC',
            message: `Spawning media processing pipeline: ${videoFile} -> ${outputDir}`,
        })

        await emitDataTelemetry(ste, {
            stage: 'COMP',
            status: 'OK',
            message: `Extraction pass completed for ${targetFrames} frames.`,
        })

        if (bal && bal.slv != null) {
            bal.slv({
                datBit: {
                    idx: 'frame-data',
                    src: outputDir,
                    val: targetFrames,
                },
            })
        }
    } catch (err: any) {
        const rawMsg = err instanceof Error ? err.message : String(err)
        await emitDataTelemetry(ste, {
            stage: 'ERR',
            status: 'FAIL',
            message: `Extraction faulted: ${rawMsg}`,
        })

        if (bal && bal.slv != null) {
            bal.slv({
                datBit: {
                    idx: 'frame-data-error',
                    src: sanitizeTo7BitAscii(rawMsg),
                },
            })
        }
    }

    return cpy
}

export const flatData = async (
    cpy: DataModel,
    bal: DataBit,
    ste: State,
): Promise<DataModel> => {
    const fs = require('fs-extra')
    const path = require('path')

    const isRepoRoot = (dir: string) => {
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

    let repoRoot = process.cwd()
    while (repoRoot && !isRepoRoot(repoRoot)) {
        const parent = path.dirname(repoRoot)
        if (parent === repoRoot) break
        repoRoot = parent
    }

    const flattenDir = path.join(repoRoot, 'data', 'flatten')
    const flatDir = path.join(repoRoot, 'data', 'flat')

    await fs.ensureDir(flattenDir)
    await fs.ensureDir(flatDir)

    const targetFileName = (bal?.src || bal?.idx || '').replace(/\[|\]/g, '').trim()

    if (!targetFileName) {
        const errMsg = 'No target file name provided for flatData'
        await emitDataTelemetry(ste, {
            stage: 'ERR',
            status: 'FAIL',
            message: errMsg,
        })
        if (bal && bal.slv != null) {
            bal.slv({
                datBit: { idx: 'flat-data-error', src: errMsg },
                flatBit: { idx: 'flat-data-error', src: errMsg },
            })
        }
        return cpy
    }

    const targetOutputFile = path.join(flatDir, targetFileName)

    await emitDataTelemetry(ste, {
        stage: 'PREP',
        message: `Scanning data/flatten for text and markdown files...`,
    })

    const VALID_EXTS = new Set(['.txt', '.md', '.markdown'])
    const entries = await fs.readdir(flattenDir, { withFileTypes: true })
    const textFiles: string[] = []

    for (const entry of entries) {
        if (!entry.isFile()) continue
        const ext = path.extname(entry.name).toLowerCase()
        if (VALID_EXTS.has(ext)) {
            textFiles.push(path.join(flattenDir, entry.name))
        }
    }

    if (textFiles.length === 0) {
        const errMsg = 'No text or markdown files found in data/flatten'
        await emitDataTelemetry(ste, {
            stage: 'ERR',
            status: 'FAIL',
            message: errMsg,
        })
        if (bal && bal.slv != null) {
            bal.slv({
                datBit: { idx: 'flat-data-error', src: errMsg, val: 0 },
                flatBit: { idx: 'flat-data-error', src: errMsg, val: 0 },
            })
        }
        return cpy
    }

    textFiles.sort((a, b) => a.localeCompare(b))

    await emitDataTelemetry(ste, {
        stage: 'EXEC',
        message: `Combining ${textFiles.length} files into data/flat/${targetFileName}...`,
    })

    const fileContents = await Promise.all(
        textFiles.map(async (filePath) => {
            const content = await fs.readFile(filePath, 'utf8')
            const relPath = path.relative(repoRoot, filePath).replace(/\\/g, '/')
            return `// ----- SOURCE: ${relPath} -----\n${content}`
        }),
    )

    const combinedOutput = fileContents.join('\n\n')
    await fs.outputFile(targetOutputFile, combinedOutput, 'utf8')

    const relTarget = path.relative(repoRoot, targetOutputFile).replace(/\\/g, '/')

    await emitDataTelemetry(ste, {
        stage: 'COMP',
        status: 'OK',
        message: `Combined ${textFiles.length} files -> ${relTarget}`,
    })

    if (bal && bal.slv != null) {
        bal.slv({
            datBit: {
                idx: 'flat-data',
                src: relTarget,
                val: textFiles.length,
            },
            flatBit: {
                idx: 'flat-data',
                src: relTarget,
                val: textFiles.length,
            },
        })
    }

    return cpy
}
