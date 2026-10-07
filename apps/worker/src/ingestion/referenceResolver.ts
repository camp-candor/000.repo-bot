import type { GitTreeNode } from './gitTreeClient.js'

export interface CharacterReferenceEntry {
    characterId: string
    modelSheetPath: string
    palettePath?: string
}

export interface EnvironmentReferenceEntry {
    locationId: string
    layoutPath: string
    lightingKeyPath?: string
}

export interface ReferenceManifest {
    schemaVersion: string
    shotId: string
    characterRefs: CharacterReferenceEntry[]
    environmentRefs: EnvironmentReferenceEntry[]
    continuityInvariants: string[]
}

/**
 * Validates and parses raw JSON into a typed ReferenceManifest.
 */
export function parseReferenceManifest(rawJson: string): ReferenceManifest {
    let parsed: any
    try {
        parsed = JSON.parse(rawJson)
    } catch (err: any) {
        throw new Error(
            `INVALID_MANIFEST_JSON: Malformed JSON syntax - ${err.message}`,
        )
    }

    if (!parsed.shotId || typeof parsed.shotId !== 'string') {
        throw new Error(
            'INVALID_MANIFEST_SCHEMA: Missing or invalid mandatory field "shotId".',
        )
    }

    if (
        !Array.isArray(parsed.characterRefs) ||
        !Array.isArray(parsed.environmentRefs)
    ) {
        throw new Error(
            'INVALID_MANIFEST_SCHEMA: "characterRefs" and "environmentRefs" must be arrays.',
        )
    }

    return {
        schemaVersion: parsed.schemaVersion || '1.0.0',
        shotId: parsed.shotId,
        characterRefs: parsed.characterRefs,
        environmentRefs: parsed.environmentRefs,
        continuityInvariants: Array.isArray(parsed.continuityInvariants)
            ? parsed.continuityInvariants
            : [],
    }
}

/**
 * Extracts all unique file paths required by the reference manifest.
 */
export function extractRequiredPaths(manifest: ReferenceManifest): string[] {
    const paths = new Set<string>()

    for (const charRef of manifest.characterRefs) {
        if (charRef.modelSheetPath) paths.add(charRef.modelSheetPath)
        if (charRef.palettePath) paths.add(charRef.palettePath)
    }

    for (const envRef of manifest.environmentRefs) {
        if (envRef.layoutPath) paths.add(envRef.layoutPath)
        if (envRef.lightingKeyPath) paths.add(envRef.lightingKeyPath)
    }

    return Array.from(paths)
}

/**
 * Matches required file paths against blobless Git tree nodes.
 */
export function matchTreeNodes(
    tree: GitTreeNode[],
    requiredPaths: string[],
): Map<string, GitTreeNode> {
    const nodeMap = new Map<string, GitTreeNode>()
    for (const node of tree) {
        if (node.type === 'blob') {
            nodeMap.set(node.path, node)
        }
    }

    const matched = new Map<string, GitTreeNode>()
    const missing: string[] = []

    for (const path of requiredPaths) {
        const found = nodeMap.get(path)
        if (found) {
            matched.set(path, found)
        } else {
            missing.push(path)
        }
    }

    if (missing.length > 0) {
        throw new Error(
            `REFERENCE_PATH_NOT_FOUND: Required reference assets missing from Git tree: ${missing.join(', ')}`,
        )
    }

    return matched
}
