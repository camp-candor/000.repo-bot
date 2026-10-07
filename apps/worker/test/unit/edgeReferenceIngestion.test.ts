import { describe, it, expect } from 'vitest'
import {
    parseReferenceManifest,
    extractRequiredPaths,
    matchTreeNodes,
} from '../../src/ingestion/referenceResolver.js'
import { EdgeReferenceCache } from '../../src/ingestion/edgeReferenceCache.js'
import type { GitTreeNode } from '../../src/ingestion/gitTreeClient.js'
import { ShotCoordinatorDO } from '../../src/objects/ShotCoordinatorDO.js'

class MockDurableObjectStorage {
    public store = new Map<string, any>()
    async get(key: string): Promise<any> {
        return this.store.get(key)
    }
    async put(key: string, value: any): Promise<void> {
        this.store.set(key, value)
    }
    async delete(key: string): Promise<void> {
        this.store.delete(key)
    }
}

class MockDurableObjectContext {
    public storage = new MockDurableObjectStorage()
    blockConcurrencyWhile(fn: () => Promise<any>): Promise<any> {
        return fn()
    }
}

describe('Zero-Clone Edge Reference Ingestion Battery (Phase 1)', () => {
    const sampleManifestJson = JSON.stringify({
        schemaVersion: '1.0.0',
        shotId: 'shot-042',
        characterRefs: [
            {
                characterId: 'char-bog',
                modelSheetPath: 'references/characters/bog_sheet.json',
                palettePath: 'references/characters/bog_palette.json',
            },
        ],
        environmentRefs: [
            {
                locationId: 'loc-citadel',
                layoutPath: 'references/locations/citadel_layout.json',
            },
        ],
        continuityInvariants: ['somatic_wound_left_cheek', 'no_zippers'],
    })

    const sampleTree: GitTreeNode[] = [
        {
            path: 'references/characters/bog_sheet.json',
            mode: '100644',
            type: 'blob',
            sha: 'sha_sheet_01',
            size: 1200,
        },
        {
            path: 'references/characters/bog_palette.json',
            mode: '100644',
            type: 'blob',
            sha: 'sha_palette_01',
            size: 800,
        },
        {
            path: 'references/locations/citadel_layout.json',
            mode: '100644',
            type: 'blob',
            sha: 'sha_citadel_01',
            size: 2400,
        },
        {
            path: 'unused/noise.png',
            mode: '100644',
            type: 'blob',
            sha: 'sha_unused',
            size: 5000,
        },
    ]

    it('TASK-1.1: validates manifest schema and extracts unique asset paths', () => {
        const manifest = parseReferenceManifest(sampleManifestJson)
        expect(manifest.shotId).toBe('shot-042')
        expect(manifest.characterRefs).toHaveLength(1)

        const paths = extractRequiredPaths(manifest)
        expect(paths).toHaveLength(3)
        expect(paths).toContain('references/characters/bog_sheet.json')
        expect(paths).toContain('references/locations/citadel_layout.json')
    })

    it('TASK-1.1: matches required paths to tree nodes and throws if assets are missing', () => {
        const manifest = parseReferenceManifest(sampleManifestJson)
        const paths = extractRequiredPaths(manifest)

        const matched = matchTreeNodes(sampleTree, paths)
        expect(matched.size).toBe(3)
        expect(matched.get('references/characters/bog_sheet.json')?.sha).toBe(
            'sha_sheet_01',
        )

        // Missing path test
        const incompleteTree = sampleTree.filter(
            (n) => !n.path.includes('citadel'),
        )
        expect(() => matchTreeNodes(incompleteTree, paths)).toThrow(
            /REFERENCE_PATH_NOT_FOUND/,
        )
    })

    it('TASK-1.2: enforces single-file (2 MB) and cumulative bundle (16 MB) ceilings', async () => {
        const cache = new EdgeReferenceCache(1000, 5000) // Strict limits for test
        const manifest = parseReferenceManifest(sampleManifestJson)

        const oversizedTree: GitTreeNode[] = [
            {
                path: 'references/characters/bog_sheet.json',
                mode: '100644',
                type: 'blob',
                sha: 'sha_huge',
                size: 1500,
            },
            {
                path: 'references/characters/bog_palette.json',
                mode: '100644',
                type: 'blob',
                sha: 'sha_small',
                size: 100,
            },
            {
                path: 'references/locations/citadel_layout.json',
                mode: '100644',
                type: 'blob',
                sha: 'sha_small2',
                size: 100,
            },
        ]

        await expect(
            cache.ingestReferenceBundle(
                oversizedTree,
                'tree_sha_root',
                manifest,
                async () => ({
                    path: 'p',
                    sha: 's',
                    content: 'c',
                    encoding: 'utf-8',
                    fromCache: false,
                    sizeBytes: 100,
                }),
            ),
        ).rejects.toThrow(/REFERENCE_SIZE_EXCEEDED/)
    })

    it('TASK-1.2: serves repeat queries from immutable Git SHA cache without re-fetching', async () => {
        const cache = new EdgeReferenceCache()
        const manifest = parseReferenceManifest(sampleManifestJson)

        let fetchCount = 0
        const mockFetcher = async (sha: string, path: string) => {
            fetchCount++
            return {
                path,
                sha,
                content: `content_for_${sha}`,
                encoding: 'utf-8' as const,
                fromCache: false,
                sizeBytes: 100,
            }
        }

        // First ingestion: fetches all 3 blobs
        const bundle1 = await cache.ingestReferenceBundle(
            sampleTree,
            'tree_root_01',
            manifest,
            mockFetcher,
        )
        expect(fetchCount).toBe(3)
        expect(
            bundle1.references['references/characters/bog_sheet.json']
                .fromCache,
        ).toBe(false)

        // Second ingestion with identical SHAs: served entirely from memory cache
        const bundle2 = await cache.ingestReferenceBundle(
            sampleTree,
            'tree_root_02',
            manifest,
            mockFetcher,
        )
        expect(fetchCount).toBe(3) // Zero network calls on second run!
        expect(
            bundle2.references['references/characters/bog_sheet.json']
                .fromCache,
        ).toBe(true)
    })

    it('TASK-1.3: pins reference bundle in ShotCoordinatorDO and commits ledger block', async () => {
        const mockCtx = new MockDurableObjectContext()
        const coordinator = new ShotCoordinatorDO(mockCtx as any, {})

        // Enqueue task
        await coordinator.fetch(
            new Request('https://do.internal/enqueue', {
                method: 'POST',
                body: JSON.stringify({ taskId: 'shot-042' }),
            }),
        )

        // Pin references
        const pinRes = await coordinator.fetch(
            new Request('https://do.internal/references/pin', {
                method: 'POST',
                body: JSON.stringify({
                    tree: sampleTree,
                    treeSha: 'tree_sha_commit_01',
                    manifestJson: sampleManifestJson,
                    mockBlobs: {
                        sha_sheet_01: '{"bog":"sheet"}',
                        sha_palette_01: '{"bog":"palette"}',
                        sha_citadel_01: '{"citadel":"layout"}',
                    },
                }),
            }),
        )

        expect(pinRes.status).toBe(200)
        const pinData = (await pinRes.json()) as any
        expect(pinData.ok).toBe(true)
        expect(pinData.referencesCount).toBe(3)

        // Verify state inspection returns pinned bundle
        const readRes = await coordinator.fetch(
            new Request('https://do.internal/references'),
        )
        const readData = (await readRes.json()) as any
        expect(readData.bundle.shotId).toBe('shot-042')
        expect(
            readData.bundle.references['references/characters/bog_sheet.json'],
        ).toBeDefined()

        // Verify unpinned returns 404
        const unpinnedCoord = new ShotCoordinatorDO(
            new MockDurableObjectContext() as any,
            {},
        )
        const unpinnedRes = await unpinnedCoord.fetch(
            new Request('https://do.internal/references'),
        )
        expect(unpinnedRes.status).toBe(404)
    })

    it('INVARIANT 1: deduplicates shared paths across characters and rejects malformed schema', () => {
        const sharedPaletteManifest = {
            schemaVersion: '1.0.0',
            shotId: 'shot-043',
            characterRefs: [
                {
                    characterId: 'char-1',
                    modelSheetPath: 'references/char1.json',
                    palettePath: 'references/shared_palette.json',
                },
                {
                    characterId: 'char-2',
                    modelSheetPath: 'references/char2.json',
                    palettePath: 'references/shared_palette.json',
                },
            ],
            environmentRefs: [],
            continuityInvariants: [],
        }

        const paths = extractRequiredPaths(sharedPaletteManifest)
        expect(paths).toHaveLength(3)
        expect(
            paths.filter((p) => p === 'references/shared_palette.json'),
        ).toHaveLength(1)

        // Malformed schema assertions
        expect(() => parseReferenceManifest(JSON.stringify({}))).toThrow(
            /INVALID_MANIFEST_SCHEMA/,
        )
        expect(() =>
            parseReferenceManifest(
                JSON.stringify({
                    shotId: 's1',
                    characterRefs: 'not_an_array',
                    environmentRefs: [],
                }),
            ),
        ).toThrow(/INVALID_MANIFEST_SCHEMA/)
        expect(() => parseReferenceManifest('{bad_json')).toThrow(
            /INVALID_MANIFEST_JSON/,
        )
    })

    it('INVARIANT 4: enforces cumulative bundle budget enforcement (16 MB ceiling)', async () => {
        const cache = new EdgeReferenceCache(2 * 1024 * 1024, 16 * 1024 * 1024)
        // 9 files of 1.9 MB each = ~17.1 MB > 16 MB
        const largeManifest = {
            schemaVersion: '1.0.0',
            shotId: 'shot-large',
            characterRefs: Array.from({ length: 9 }).map((_, i) => ({
                characterId: `char-${i}`,
                modelSheetPath: `references/char_${i}.json`,
            })),
            environmentRefs: [],
            continuityInvariants: [],
        }

        const treeNodes: GitTreeNode[] = Array.from({ length: 9 }).map(
            (_, i) => ({
                path: `references/char_${i}.json`,
                mode: '100644',
                type: 'blob',
                sha: `sha_large_${i}`,
                size: Math.floor(1.9 * 1024 * 1024),
            }),
        )

        let fetchAttempted = false
        await expect(
            cache.ingestReferenceBundle(
                treeNodes,
                'tree_sha_large',
                largeManifest,
                async () => {
                    fetchAttempted = true
                    return {
                        path: 'p',
                        sha: 's',
                        content: 'c',
                        encoding: 'utf-8',
                        fromCache: false,
                        sizeBytes: 100,
                    }
                },
            ),
        ).rejects.toThrow(/BUNDLE_SIZE_EXCEEDED/)

        // Assert zero blob fetches are attempted when budget is exceeded
        expect(fetchAttempted).toBe(false)
    })

    it('INVARIANT 6: verifies cryptographic ledger chaining and REFERENCES_PINNED event', async () => {
        const mockCtx = new MockDurableObjectContext()
        const coordinator = new ShotCoordinatorDO(mockCtx as any, {})

        await coordinator.fetch(
            new Request('https://do.internal/enqueue', {
                method: 'POST',
                body: JSON.stringify({ taskId: 'shot-chain-test' }),
            }),
        )

        await coordinator.fetch(
            new Request('https://do.internal/references/pin', {
                method: 'POST',
                body: JSON.stringify({
                    tree: sampleTree,
                    treeSha: 'tree_sha_chain',
                    manifestJson: sampleManifestJson,
                }),
            }),
        )

        const ledgerRes = await coordinator.fetch(
            new Request('https://do.internal/ledger'),
        )
        const ledgerData = (await ledgerRes.json()) as any
        const chain = ledgerData.chain

        expect(chain.length).toBeGreaterThanOrEqual(2)
        const pinnedBlock = chain.find(
            (b: any) => b.eventType === 'REFERENCES_PINNED',
        )
        expect(pinnedBlock).toBeDefined()
        expect(pinnedBlock.payload.shotId).toBe('shot-042')
        expect(pinnedBlock.payload.treeSha).toBe('tree_sha_chain')

        // Verify ledger verification endpoint passes integrity
        const verifyRes = await coordinator.fetch(
            new Request('https://do.internal/ledger/verify'),
        )
        const verifyData = (await verifyRes.json()) as any
        expect(verifyData.valid).toBe(true)
    })
})
