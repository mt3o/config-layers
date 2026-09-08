// vite.config.ts
import { defineConfig } from 'vite';
import doctest from 'vite-plugin-doctest';

export default defineConfig({
  plugins: [doctest()],
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
    minify: false,
    lib: {
      entry: 'src/index.ts',
      name: 'Config Layers',
      fileName: 'config-layers',
      formats: ['es','cjs','umd'],
    },
    rollupOptions: {
      // Externalize dependencies you don't want bundled
      external: [],
      output: {

      },
    },
  },
});
