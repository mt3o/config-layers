import {fileURLToPath} from 'node:url';
import {defineConfig} from 'vitest/config';
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
        // Scoped deliberately: a bare `./**/*.md` collects every markdown file that so much as
        // mentions the in-source test flag in prose, and fails it with "No test suite found".
        includeSource: [
            './src/**/*.[jt]s?(x)',
            './README.md',
            './docs/**/*.md',
            './examples/**/*.md',
        ],
    },
});
