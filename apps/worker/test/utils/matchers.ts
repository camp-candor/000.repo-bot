import { expect } from 'vitest'

// Define the interface for TypeScript
interface CustomMatchers<R = unknown> {
    toExecuteWithinBudget(budgetMs: number): Promise<R>
}

declare module 'vitest' {
    interface Assertion<T = any> extends CustomMatchers<T> {}
    interface AsymmetricMatchersContaining extends CustomMatchers {}
}

/**
 * THE STOPWATCH OF DOOM
 * Fails the test if the async function takes longer than {budgetMs}.
 */
expect.extend({
    async toExecuteWithinBudget(
        received: () => Promise<any>,
        budgetMs: number,
    ) {
        const start = performance.now()

        try {
            await received()
        } catch (error) {
            return {
                pass: false,
                message: () =>
                    `Expected function to execute successfully, but it threw: ${error}`,
            }
        }

        const end = performance.now()
        const duration = end - start

        const pass = duration <= budgetMs

        return {
            pass,
            message: () =>
                pass
                    ? `Expected execution time to exceed ${budgetMs}ms, but it took ${duration.toFixed(2)}ms.`
                    : `PERFORMANCE VIOLATION: Function took ${duration.toFixed(2)}ms, exceeding budget of ${budgetMs}ms.\n` +
                      `This code is too slow for the Edge. Refactor immediately.`,
        }
    },
})
