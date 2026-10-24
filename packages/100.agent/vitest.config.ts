import { defineConfig } from 'vitest/config'

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['00.agent.unit/**/*.test.ts'],
    },
})
