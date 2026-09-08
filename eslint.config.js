// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    {
        // Build output, dependencies and editor state. `dist` is generated on every build, and
        // linting it would report on minified code.
        ignores: ['dist/**', 'node_modules/**', 'coverage/**', '.idea/**', 'examples/node_modules/**'],
    },

    js.configs.recommended,
    ...tseslint.configs.recommended,

    {
        rules: {
            // The proxy traps and the merge routines work on values whose shape is only known at
            // runtime, so `any` is load-bearing here rather than a shortcut. The type safety this
            // library offers is at its public surface (see types.ts), not in its internals.
            '@typescript-eslint/no-explicit-any': 'off',

            // Unused arguments are common in the proxy traps, where the signature is fixed by the
            // Proxy contract even when a handler ignores a parameter. Underscore-prefixed names
            // are the existing convention for that.
            '@typescript-eslint/no-unused-vars': ['error', {
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_',
                caughtErrorsIgnorePattern: '^_',
            }],

            // Guards against the class of bug this codebase has already hit twice: a `==` that
            // conflates null and undefined, where the two are meaningfully different config states.
            eqeqeq: ['error', 'always', { null: 'ignore' }],
            'no-var': 'error',
            'prefer-const': 'error',
        },
    },

    {
        // `no-undef` is redundant for TypeScript - tsc already resolves every identifier, and the
        // rule cannot see type-only declarations, so it produces false positives. Kept on for the
        // plain-JS files, which nothing else checks.
        files: ['**/*.ts'],
        rules: {'no-undef': 'off'},
    },

    {
        // The one plain-JS test file. Declare the runtime globals it legitimately uses.
        files: ['**/*.js'],
        languageOptions: {
            globals: {
                console: 'readonly',
                process: 'readonly',
                globalThis: 'readonly',
            },
        },
    },

    {
        // Tests reach into internals and assert on deliberately odd shapes.
        files: ['tests/**/*.ts', 'examples/**/*.{ts,js}'],
        rules: {
            '@typescript-eslint/no-unused-expressions': 'off',
        },
    },

    {
        // Config files run in Node and are not part of the published surface.
        files: ['*.config.ts', '*.config.js'],
        rules: {
            '@typescript-eslint/no-explicit-any': 'off',
        },
    },
);
