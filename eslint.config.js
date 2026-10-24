// eslint.config.js
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import globals from 'globals'

export default tseslint.config(
    // 1. Global Ignores
    {
        ignores: [
            '**/dist/**',
            '**/packages/**',
            '**/data/**',
            '**/apps/worker/**',
            '**/apps/sower/**',
            '**/vcode/**',
            '**/coverage/**',
            '**/node_modules/**',
            '**/*.d.ts',
            '**/.wrangler/**',
            '**/apps/995.library/**',
        ],
    },

    // 2. Main Config
    {
        extends: [
            js.configs.recommended,
            ...tseslint.configs.recommendedTypeChecked,
            ...tseslint.configs.stylisticTypeChecked,
        ],
        files: ['**/*.{ts,tsx}'],
        languageOptions: {
            ecmaVersion: 2020,
            globals: globals.node,
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
            'no-console': 'warn',
            '@typescript-eslint/no-floating-promises': 'error',
            '@typescript-eslint/await-thenable': 'error',
            '@typescript-eslint/no-explicit-any': 'error',
            '@typescript-eslint/consistent-type-imports': 'error',
        },
    },

    // 3. Disable type-checking for JS files & root config scripts
    {
        extends: [tseslint.configs.disableTypeChecked],
        files: [
            '**/*.js',
            '**/*.mjs',
            '**/*.cjs',
            'vitest.workspace.ts',
            'vitest.config.ts',
        ],
    },
)
