import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config'
import { resolve } from 'path'

export default defineWorkersConfig({
    resolve: {
        alias: {
            '@camp_candor/types': resolve(
                __dirname,
                './packages/types/src/index.ts',
            ),
        },
    },
    test: {
        // FIX: Increase timeout to allow for exponential backoff retries (Chaos Engineering)
        testTimeout: 60000,
        include: ['test/unit/**/*.test.ts'],
        poolOptions: {
            workers: {
                wrangler: { configPath: './apps/worker/wrangler.jsonc' },
                singleWorker: true,
                isolatedStorage: false,
                miniflare: {
                    durableObjectsPersist: false,
                    kvPersist: false,
                    r2Persist: false,
                },
            },
        },
    },
})
