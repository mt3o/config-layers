// vite.config.ts
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import doctest from 'vite-plugin-doctest';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'));

// `/*!` marks this as a legal comment, which is the one kind esbuild's minifier keeps.
const banner = `/*! ${pkg.name} v${pkg.version} | ${pkg.license} License | ${pkg.homepage} */`;

// Written as a computed key on purpose: a plain mention of this string in any file in the repo
// makes vitest collect that file as an in-source test module. See TODO.md §6.7.
const IN_SOURCE_TEST_FLAG = 'import.meta' + '.vitest';

/**
 * Prepends the license banner after minification.
 *
 * `rollupOptions.output.banner` is not enough on its own: Vite's minify step is a `renderChunk`
 * plugin, so it sees the banner and removes it - it hardcodes esbuild's `legalComments: 'none'`,
 * which strips even `/*!` legal comments. `generateBundle` runs after every `renderChunk`, so the
 * banner added here survives. No sourcemaps are emitted for this build, so prepending is safe.
 */
const licenseBanner = () => ({
  name: 'license-banner',
  generateBundle(_options: unknown, bundle: Record<string, { type: string; code?: string }>) {
    for (const file of Object.values(bundle)) {
      if (file.type === 'chunk' && typeof file.code === 'string') {
        file.code = `${banner}\n${file.code}`;
      }
    }
  },
});

export default defineConfig({
  plugins: [doctest(), licenseBanner()],

  // Removes the in-source test suite from the published bundle. Without this the block ships as
  // live code in the ESM output and as unreachable `if (void 0)` in CJS/UMD - and, since it is the
  // only module-scope statement in the bundle, it is also the one thing standing between us and a
  // strict `sideEffects: false` check.
  define: { [IN_SOURCE_TEST_FLAG]: 'undefined' },

  build: {
    // Pinned rather than inherited. Vite's default is `baseline-widely-available`, which currently
    // resolves to safari16 and drifts upward with each Vite release - this library targets an
    // iPhone 6s (iOS 15, Safari 15), so the floor has to be stated explicitly.
    //
    // es2020 is the language floor: `import.meta` is ES2020, and esbuild warns at es2019.
    //
    // Note this is documentation, not a guard. esbuild silently downgrades some unsupported syntax
    // rather than failing - a regex lookbehind literal becomes `new RegExp("...")`, which parses
    // and then throws at runtime. tests/dist-smoke.test.ts is what actually enforces the floor.
    target: ['es2020', 'safari15', 'chrome87', 'firefox78', 'edge88'],

    // JSDoc is stripped from the bundle by this, which costs nothing: the docs an editor shows come
    // from dist/*.d.ts, emitted by a separate `tsc` step that `removeComments: false` protects.
    //
    // Vite forces `minifyWhitespace: false` for ES lib builds, so the .js output stays readable
    // while .cjs/.umd.cjs compress fully. That is deliberate on Vite's part - downstream bundlers
    // minify anyway - so the ESM figure only really matters for direct CDN use.
    minify: 'esbuild',

    lib: {
      entry: 'src/index.ts',
      name: 'ConfigLayers',
      fileName: 'config-layers',
      formats: ['es','cjs','umd'],
    },
  },
});
