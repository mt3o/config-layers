// vite.config.ts
import { defineConfig } from 'vite';
import doctest from 'vite-plugin-doctest';

export default defineConfig({
  plugins: [doctest()],
  build: {
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
