import type { VersionsManifest, PinnedRepoConfig } from './versions.interface'

export interface RepoConflictDiff {
    repoKey: string
    hasConflict: boolean
    localConfig?: PinnedRepoConfig
    remoteConfig?: PinnedRepoConfig
    diffFields: string[]
}

export interface ConflictManifestAnalysis {
    hasDivergence: boolean
    conflictCount: number
    conflicts: Record<string, RepoConflictDiff>
}

export interface ScratchpadMetadata {
    scratchpadPath: string
    canonicalPath: string
    nonce: string
    timestamp: string
    conflictCount: number
    conflicts: string[]
}
