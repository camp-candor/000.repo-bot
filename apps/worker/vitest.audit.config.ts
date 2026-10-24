import { defineConfig } from 'vitest/config'

export default defineConfig({
    test: {
        include: ['test/audit/**/*.test.ts'],
        environment: 'node',
        testTimeout: 30000,
    },
})
