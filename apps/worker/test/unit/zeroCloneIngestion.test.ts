import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RateLimitGuard } from '../../src/telemetry/rateLimitGuard.js'
import {
    ZeroCloneGitClient,
    type GitTreeNode,
} from '../../src/ingestion/gitTreeClient.js'

describe('Zero-Clone Reference Ingestion & Rate-Limit Preservation (Phase 1)', () => {
    let guard: RateLimitGuard

    beforeEach(() => {
        guard = new RateLimitGuard({
            safetyReserveFloor: 500,
            alertThreshold: 1000,
        })
    })

    it('TASK-1.1: RateLimitGuard extracts GitHub rate-limit headers accurately', () => {
        const headers = new Headers({
            'x-ratelimit-limit': '5000',
            'x-ratelimit-remaining': '4820',
            'x-ratelimit-reset': '2000000000',
        })

        const state = guard.updateFromHeaders(headers)
        expect(state.limit).toBe(5000)
        expect(state.remaining).toBe(4820)
        expect(state.resetEpochSec).toBe(2000000000)
    })

    it('TASK-1.1: RateLimitGuard fails-closed when non-critical request encounters depleted quota', () => {
        // Deplete quota below safety reserve floor (500)
        guard.updateFromHeaders(
            new Headers({
                'x-ratelimit-limit': '5000',
                'x-ratelimit-remaining': '450',
                'x-ratelimit-reset': '2000000000',
            }),
        )

        // Non-critical request must be blocked immediately before calling fetch
        expect(() => {
            guard.assertQuotaAvailable(false)
        }).toThrow(/GITHUB_RATE_LIMIT_EXHAUSTED/)
    })

    it('TASK-1.1: RateLimitGuard permits critical requests (e.g. CAS Merge) even below safety reserve floor', () => {
        guard.updateFromHeaders(
            new Headers({
                'x-ratelimit-limit': '5000',
                'x-ratelimit-remaining': '120',
                'x-ratelimit-reset': '2000000000',
            }),
        )

        // Critical operations bypass the safety reserve check
        expect(() => {
            guard.assertQuotaAvailable(true)
        }).not.toThrow()
    })

    it('TASK-1.2: ZeroCloneGitClient sends If-None-Match and serves tree from cache on 304 Not Modified (0 quota cost)', async () => {
        const mockTree: GitTreeNode[] = [
            {
                path: 'references/raw/take_01.png',
                mode: '100644',
                type: 'blob',
                sha: 'sha_blob_01',
                size: 1024,
            },
            {
                path: 'references/raw/source_log.json',
                mode: '100644',
                type: 'blob',
                sha: 'sha_log_01',
                size: 512,
            },
        ]

        let callCount = 0
        const mockFetch = vi
            .fn()
            .mockImplementation(async (_url: string, opts: any) => {
                callCount++
                if (callCount === 1) {
                    return new Response(
                        JSON.stringify({
                            sha: 'tree_sha_01',
                            tree: mockTree,
                            truncated: false,
                        }),
                        {
                            status: 200,
                            headers: {
                                'etag': 'W/"etag_tree_01"',
                                'x-ratelimit-limit': '5000',
                                'x-ratelimit-remaining': '4999',
                                'x-ratelimit-reset': '2000000000',
                            },
                        },
                    )
                } else {
                    // Secondary call includes If-None-Match header
                    expect(opts.headers['If-None-Match']).toBe(
                        'W/"etag_tree_01"',
                    )
                    return new Response(null, {
                        status: 304,
                        headers: {
                            'x-ratelimit-limit': '5000',
                            'x-ratelimit-remaining': '4999', // 0 Quota deduction
                            'x-ratelimit-reset': '2000000000',
                        },
                    })
                }
            })

        const client = new ZeroCloneGitClient(
            'ghp_test_token',
            'camp-candor/000.repo-bot',
            { guard },
        )
        const originalFetch = globalThis.fetch
        globalThis.fetch = mockFetch

        // First fetch: HTTP 200
        const firstRes = await client.fetchTree('main')
        expect(firstRes.fromCache).toBe(false)
        expect(firstRes.tree).toHaveLength(2)

        // Second fetch: HTTP 304
        const secondRes = await client.fetchTree('main')
        expect(secondRes.fromCache).toBe(true)
        expect(secondRes.tree).toHaveLength(2)

        globalThis.fetch = originalFetch
    })

    it('TASK-1.2: resolves and filters files by prefix and extension without downloading file bodies', () => {
        const client = new ZeroCloneGitClient(
            'ghp_test_token',
            'camp-candor/000.repo-bot',
        )
        const sampleTree: GitTreeNode[] = [
            {
                path: 'references/raw/image1.png',
                mode: '100644',
                type: 'blob',
                sha: 'sha1',
                size: 500,
            },
            {
                path: 'references/raw/source_log.json',
                mode: '100644',
                type: 'blob',
                sha: 'sha2',
                size: 300,
            },
            {
                path: 'packages/821.repobot/src/index.ts',
                mode: '100644',
                type: 'blob',
                sha: 'sha3',
                size: 1200,
            },
            {
                path: 'references/raw/giant_asset.bin',
                mode: '100644',
                type: 'blob',
                sha: 'sha4',
                size: 10_000_000,
            },
        ]

        // Filter references/raw/ JSON files
        const jsonFiles = client.resolveFilesByPattern(sampleTree, {
            prefix: 'references/raw/',
            extension: '.json',
        })

        expect(jsonFiles).toHaveLength(1)
        expect(jsonFiles[0].path).toBe('references/raw/source_log.json')

        // Filter files within size ceiling (rejects 10MB binary blob)
        const smallFiles = client.resolveFilesByPattern(sampleTree, {
            prefix: 'references/raw/',
            maxSizeBytes: 2 * 1024 * 1024,
        })

        expect(smallFiles).toHaveLength(2)
        expect(smallFiles.map((f) => f.path)).not.toContain(
            'references/raw/giant_asset.bin',
        )
    })

    it('TASK-1.2: fetches blob lazily and serves repeated queries from immutable SHA cache with 0 network calls', async () => {
        const client = new ZeroCloneGitClient(
            'ghp_test_token',
            'camp-candor/000.repo-bot',
            { guard },
        )

        const blobData = {
            sha: 'blob_sha_abc123',
            size: 24,
            encoding: 'base64',
            content: Buffer.from('{"character": "Bog"}').toString('base64'),
        }

        const mockFetch = vi.fn().mockResolvedValue(
            new Response(JSON.stringify(blobData), {
                status: 200,
                headers: {
                    'x-ratelimit-limit': '5000',
                    'x-ratelimit-remaining': '4990',
                    'x-ratelimit-reset': '2000000000',
                },
            }),
        )

        const originalFetch = globalThis.fetch
        globalThis.fetch = mockFetch

        // First read: Triggers network fetch
        const firstRead = await client.fetchBlob(
            'blob_sha_abc123',
            'references/raw/bog.json',
        )
        expect(firstRead.fromCache).toBe(false)
        expect(firstRead.content).toBe('{"character": "Bog"}')
        expect(mockFetch).toHaveBeenCalledTimes(1)

        // Second read with identical SHA: Served strictly from immutable memory cache
        const secondRead = await client.fetchBlob(
            'blob_sha_abc123',
            'references/raw/bog.json',
        )
        expect(secondRead.fromCache).toBe(true)
        expect(secondRead.content).toBe('{"character": "Bog"}')
        expect(mockFetch).toHaveBeenCalledTimes(1) // Call count remains 1 (0 network egress!)

        globalThis.fetch = originalFetch
    })

    it('TASK-1.2: rejects oversized file blobs to preserve 128 MB V8 isolate memory ceiling', async () => {
        const client = new ZeroCloneGitClient(
            'ghp_test_token',
            'camp-candor/000.repo-bot',
            {
                guard,
                maxSingleFileSize: 1024, // 1 KB ceiling for test
            },
        )

        const oversizedData = {
            sha: 'blob_huge_sha',
            size: 5000,
            encoding: 'base64',
            content: Buffer.from('A'.repeat(5000)).toString('base64'),
        }

        const mockFetch = vi.fn().mockResolvedValue(
            new Response(JSON.stringify(oversizedData), {
                status: 200,
                headers: {
                    'x-ratelimit-limit': '5000',
                    'x-ratelimit-remaining': '4980',
                    'x-ratelimit-reset': '2000000000',
                },
            }),
        )

        const originalFetch = globalThis.fetch
        globalThis.fetch = mockFetch

        await expect(client.fetchBlob('blob_huge_sha')).rejects.toThrow(
            /BLOB_SIZE_EXCEEDS_CEILING/,
        )

        globalThis.fetch = originalFetch
    })
})
