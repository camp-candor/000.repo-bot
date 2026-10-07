import { RateLimitGuard } from '../telemetry/rateLimitGuard.js'

export interface GitTreeNode {
    path: string
    mode: string
    type: 'blob' | 'tree' | 'commit'
    sha: string
    size?: number
}

export interface GitTreeResponse {
    sha: string
    tree: GitTreeNode[]
    truncated: boolean
}

export interface IngestedFile {
    path: string
    sha: string
    content: string
    encoding: 'utf-8'
    fromCache: boolean
    sizeBytes: number
}

export interface TreeFilterOptions {
    prefix?: string
    extension?: string
    maxSizeBytes?: number
}

export interface ZeroCloneClientOptions {
    guard?: RateLimitGuard
    baseUrl?: string
    maxSingleFileSize?: number
}

export const DEFAULT_MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024 // 2 MB Ceiling to protect 128 MB Isolate Budget

export class ZeroCloneGitClient {
    private guard: RateLimitGuard
    private baseUrl: string
    private maxSingleFileSize: number

    // In-memory ETag & Tree Caches
    private treeEtagCache = new Map<string, string>()
    private treeDataCache = new Map<string, GitTreeNode[]>()

    // Immutable Content-Addressed Blob Cache: Blob SHA -> Decoded UTF-8 content
    private blobCache = new Map<string, string>()

    constructor(
        private token: string,
        private repo: string,
        options: ZeroCloneClientOptions = {},
    ) {
        this.guard = options.guard || new RateLimitGuard()
        this.baseUrl = options.baseUrl || 'https://api.github.com'
        this.maxSingleFileSize =
            options.maxSingleFileSize ?? DEFAULT_MAX_FILE_SIZE_BYTES
    }

    /**
     * Ingests the Git tree bloblessly with ETag caching to preserve API rate limits.
     */
    public async fetchTree(
        treeShaOrRef: string,
        recursive = true,
    ): Promise<{ tree: GitTreeNode[]; fromCache: boolean }> {
        const url = `${this.baseUrl}/repos/${this.repo}/git/trees/${encodeURIComponent(treeShaOrRef)}${recursive ? '?recursive=1' : ''}`
        const cachedEtag = this.treeEtagCache.get(treeShaOrRef)

        const headers: Record<string, string> = {
            'Authorization': `Bearer ${this.token}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': '000.repo-bot-zero-clone',
        }

        if (cachedEtag) {
            headers['If-None-Match'] = cachedEtag
        }

        const response = await this.guard.executeWithQuotaProtection(() =>
            fetch(url, { method: 'GET', headers }),
        )

        // 304 Not Modified: 0 Quota cost, return cached tree
        if (response.status === 304) {
            const cachedTree = this.treeDataCache.get(treeShaOrRef) || []
            console.log(
                `>> [ZERO_CLONE:304] Tree '${treeShaOrRef}' unmodified. Served from cache at 0 quota spend [OK]`,
            )
            return { tree: cachedTree, fromCache: true }
        }

        if (!response.ok) {
            const errorText = await response.text()
            throw new Error(
                `GIT_TREE_FETCH_FAILED: ${response.status} - ${errorText}`,
            )
        }

        const responseEtag = response.headers.get('etag')
        if (responseEtag) {
            this.treeEtagCache.set(treeShaOrRef, responseEtag)
        }

        const data = (await response.json()) as GitTreeResponse

        if (data.truncated) {
            console.warn(
                `>> [TREE:WARN] Repository tree '${treeShaOrRef}' was truncated by GitHub API [TRUNCATED]`,
            )
        }

        this.treeDataCache.set(treeShaOrRef, data.tree)
        console.log(
            `>> [ZERO_CLONE:FETCH] Ingested ${data.tree.length} tree nodes for '${treeShaOrRef}' without cloning [OK]`,
        )

        return { tree: data.tree, fromCache: false }
    }

    /**
     * Fetches and decodes an individual blob on-demand by cryptographic SHA.
     * Uses immutable content addressing: identical SHAs are served from memory cache forever.
     */
    public async fetchBlob(
        blobSha: string,
        knownPath = 'unknown',
    ): Promise<IngestedFile> {
        // Fast-path: Check immutable content-addressed cache
        if (this.blobCache.has(blobSha)) {
            const cachedContent = this.blobCache.get(blobSha)!
            return {
                path: knownPath,
                sha: blobSha,
                content: cachedContent,
                encoding: 'utf-8',
                fromCache: true,
                sizeBytes: cachedContent.length,
            }
        }

        const url = `${this.baseUrl}/repos/${this.repo}/git/blobs/${encodeURIComponent(blobSha)}`
        const response = await this.guard.executeWithQuotaProtection(() =>
            fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': '000.repo-bot-zero-clone',
                },
            }),
        )

        if (!response.ok) {
            const errorText = await response.text()
            throw new Error(
                `GIT_BLOB_FETCH_FAILED: ${response.status} - ${errorText}`,
            )
        }

        const data = (await response.json()) as {
            content: string
            encoding: string
            size: number
        }

        if (data.size > this.maxSingleFileSize) {
            throw new Error(
                `BLOB_SIZE_EXCEEDS_CEILING: File size (${data.size} bytes) exceeds maximum allowable limit (${this.maxSingleFileSize} bytes).`,
            )
        }

        let decodedContent = ''
        if (data.encoding === 'base64') {
            const cleanBase64 = data.content.replace(/\n/g, '')
            decodedContent = Buffer.from(cleanBase64, 'base64').toString(
                'utf-8',
            )
        } else {
            decodedContent = data.content
        }

        // Cache permanently by immutable Git SHA
        this.blobCache.set(blobSha, decodedContent)
        console.log(
            `>> [BLOB:INGEST] Fetched blob '${blobSha}' (${data.size} bytes) on-demand [OK]`,
        )

        return {
            path: knownPath,
            sha: blobSha,
            content: decodedContent,
            encoding: 'utf-8',
            fromCache: false,
            sizeBytes: data.size,
        }
    }

    /**
     * Resolves matching tree nodes by path prefix, extension, and size ceilings without fetching bodies.
     */
    public resolveFilesByPattern(
        tree: GitTreeNode[],
        options: TreeFilterOptions = {},
    ): GitTreeNode[] {
        const {
            prefix,
            extension,
            maxSizeBytes = this.maxSingleFileSize,
        } = options

        return tree.filter((node) => {
            if (node.type !== 'blob') {
                return false
            }

            if (prefix && !node.path.startsWith(prefix)) {
                return false
            }

            if (extension && !node.path.endsWith(extension)) {
                return false
            }

            if (node.size !== undefined && node.size > maxSizeBytes) {
                console.warn(
                    `>> [TREE:SKIP] Skipping oversized blob '${node.path}' (${node.size} > ${maxSizeBytes} bytes) [SKIP]`,
                )
                return false
            }

            return true
        })
    }

    /**
     * Ingests a specific file's content on-demand from a previously resolved tree.
     */
    public async ingestFileContent(
        tree: GitTreeNode[],
        targetPath: string,
    ): Promise<IngestedFile> {
        const node = tree.find(
            (n) => n.path === targetPath && n.type === 'blob',
        )
        if (!node) {
            throw new Error(
                `FILE_NOT_FOUND_IN_TREE: Path '${targetPath}' does not exist in resolved Git tree.`,
            )
        }

        return this.fetchBlob(node.sha, targetPath)
    }

    /**
     * Ingests and parses a JSON reference manifest (e.g. source_log.json or curation_manifest.json).
     */
    public async ingestReferenceManifest<T = any>(
        tree: GitTreeNode[],
        manifestPath: string,
    ): Promise<T> {
        const file = await this.ingestFileContent(tree, manifestPath)
        try {
            return JSON.parse(file.content) as T
        } catch (err: any) {
            throw new Error(
                `INVALID_MANIFEST_JSON: Failed to parse manifest at '${manifestPath}': ${err.message}`,
            )
        }
    }

    public getRateLimitGuard(): RateLimitGuard {
        return this.guard
    }
}
