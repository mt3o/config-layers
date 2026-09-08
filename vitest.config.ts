import {fileURLToPath} from 'node:url';
import {configDefaults, defineConfig} from 'vitest/config';
import {doctest} from 'vite-plugin-doctest';

export default defineConfig({
    plugins: [
        doctest({
            // Puts `LayeredConfig` in scope for every markdown doctest, so the documented examples
            // can read exactly like real usage instead of opening with a dynamic import.
            markdownSetup: `import {LayeredConfig} from 'config-layers';\n`,
        }),
    ],
    resolve: {
        alias: {
            // Docs and doctests import the package by name; tests resolve that to the sources, so
            // the suite runs on a plain checkout with no build step and never validates a stale
            // dist/. The packaged output is covered separately by tests/dist-smoke.test.ts.
            'config-layers': fileURLToPath(new URL('./src/index.ts', import.meta.url)),
        },
    },
    test: {
        // The performance guards compare the library against a baseline measured in the same
        // process. Coverage instruments `src/` but not the baseline in the test file, which
        // inflates every ratio - the construction guard measures 0.58x normally and 2.33x under
        // coverage. Instrumented timings are meaningless anyway, so they are excluded from a
        // coverage run and covered by the plain `pnpm test` instead (CI runs both).
        exclude: process.argv.includes('--coverage')
            ? [...configDefaults.exclude, '**/performance.test.ts']
            : configDefaults.exclude,

        // Scoped deliberately: a bare `./**/*.md` collects every markdown file that so much as
        // mentions the in-source test flag in prose, and fails it with "No test suite found".
        includeSource: [
            './src/**/*.[jt]s?(x)',
            './README.md',
            './docs/**/*.md',
            './examples/**/*.md',
        ],
        coverage: {
            provider: 'v8',
            // Only the library itself. Tests, examples and config are not the shipped surface, and
            // including them would inflate the number without measuring anything.
            include: ['src/**/*.ts'],
            // Type-only: erased at build time, so there is nothing to execute.
            exclude: ['src/types.ts', 'src/vite-env.d.ts'],
            reporter: ['text', 'html', 'lcov'],
            // Set at what the suite actually reaches today, so a drop fails the build rather than
            // going unnoticed. Raise them as coverage improves; do not lower them to go green.
            thresholds: {
                statements: 93,
                branches: 87,
                functions: 94,
                lines: 95,
            },
        },
    },
});
