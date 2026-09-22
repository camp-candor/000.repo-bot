import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config'
import { resolve } from 'path'

export default defineWorkersConfig({
    resolve: {
        alias: {
            '@camp_candor/types': resolve(
                __dirname,
                '../../packages/types/src/index.ts',
            ),
        },
    },
    test: {
        poolOptions: {
            workers: {
                wrangler: { configPath: './wrangler.test.jsonc' },
                singleWorker: true,
                isolatedStorage: false,
                miniflare: {
                    durableObjectsPersist: false,
                    kvPersist: false,
                    r2Persist: false,
                },
            },
        },
        include: ['test/unit/**/*.test.ts'],
    },
})
