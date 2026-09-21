// vitest.audit.config.ts
import { defineConfig } from 'vitest/config'
export default defineConfig({
    test: {
        // Only look in the audit folder
        include: ['test/audit/**/*.test.ts'],
        // Run in standard Node.js, not the Worker pool
        environment: 'node',
        testTimeout: 30000, // Network requests are slow
    },
})
