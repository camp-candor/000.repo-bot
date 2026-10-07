import type { GitTreeNode, IngestedFile } from './gitTreeClient.js'
import {
    type ReferenceManifest,
    extractRequiredPaths,
    matchTreeNodes,
} from './referenceResolver.js'

export interface PinnedReferenceItem {
    path: string
    sha: string
    content: string
    sizeBytes: number
    fromCache: boolean
}

export interface ResolvedReferenceBundle {
    shotId: string
    treeSha: string
    manifest: ReferenceManifest
    references: Record<string, PinnedReferenceItem>
    totalSizeBytes: number
    resolvedAtMs: number
}

export const MAX_SINGLE_REFERENCE_BYTES = 2 * 1024 * 1024 // 2 MB single file ceiling
export const MAX_BUNDLE_TOTAL_BYTES = 16 * 1024 * 1024 // 16 MB cumulative bundle ceiling

export class EdgeReferenceCache {
    // Immutable content-addressed memory cache: Git SHA -> content string
    private shaCache = new Map<string, string>()

    constructor(
        private maxSingleFile = MAX_SINGLE_REFERENCE_BYTES,
        private maxBundleSize = MAX_BUNDLE_TOTAL_BYTES,
    ) {}

    /**
     * Ingests, validates, and pins a reference bundle without disk cloning.
     */
    public async ingestReferenceBundle(
        tree: GitTreeNode[],
        treeSha: string,
        manifest: ReferenceManifest,
        blobFetcher: (sha: string, path: string) => Promise<IngestedFile>,
    ): Promise<ResolvedReferenceBundle> {
        const requiredPaths = extractRequiredPaths(manifest)
        const matchedNodes = matchTreeNodes(tree, requiredPaths)

        let projectedTotalBytes = 0
        for (const [path, node] of matchedNodes) {
            const size = node.size || 0
            if (size > this.maxSingleFile) {
                throw new Error(
                    `REFERENCE_SIZE_EXCEEDED: File '${path}' (${size} bytes) exceeds 2 MB isolate ceiling.`,
                )
            }
            projectedTotalBytes += size
        }

        if (projectedTotalBytes > this.maxBundleSize) {
            throw new Error(
                `BUNDLE_SIZE_EXCEEDED: Cumulative reference bundle (${projectedTotalBytes} bytes) exceeds 16 MB isolate ceiling.`,
            )
        }

        const references: Record<string, PinnedReferenceItem> = {}
        let actualTotalBytes = 0

        for (const [path, node] of matchedNodes) {
            // Check in-memory content cache by immutable Git SHA
            if (this.shaCache.has(node.sha)) {
                const cachedContent = this.shaCache.get(node.sha)!
                references[path] = {
                    path,
                    sha: node.sha,
                    content: cachedContent,
                    sizeBytes: cachedContent.length,
                    fromCache: true,
                }
                actualTotalBytes += cachedContent.length
                console.log(
                    `>> [CACHE:HIT] Reference '${path}' (${node.sha.substring(0, 8)}) served from memory [OK]`,
                )
            } else {
                // Fetch blob on-demand
                const fetched = await blobFetcher(node.sha, path)
                this.shaCache.set(node.sha, fetched.content)

                references[path] = {
                    path,
                    sha: fetched.sha,
                    content: fetched.content,
                    sizeBytes: fetched.sizeBytes,
                    fromCache: false,
                }
                actualTotalBytes += fetched.sizeBytes
                console.log(
                    `>> [CACHE:INGEST] Reference '${path}' (${node.sha.substring(0, 8)}) ingested on-demand [OK]`,
                )
            }
        }

        const bundle: ResolvedReferenceBundle = {
            shotId: manifest.shotId,
            treeSha,
            manifest,
            references,
            totalSizeBytes: actualTotalBytes,
            resolvedAtMs: Date.now(),
        }

        console.log(
            `>> [ZERO_CLONE:BUNDLE] Pinned ${Object.keys(references).length} references (${actualTotalBytes} bytes) for shot '${manifest.shotId}' [OK]`,
        )
        return bundle
    }

    public clearCache(): void {
        this.shaCache.clear()
    }

    public getCacheSize(): number {
        return this.shaCache.size
    }
}
