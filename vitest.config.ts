import { defineConfig } from 'vitest/config'; // or `import { defineConfig } from 'vite';`
import { doctest } from 'vite-plugin-doctest';
export default defineConfig({
  plugins: [doctest({ /* options */ })],
  test: {
    includeSource: [
      './src/**/*.[jt]s?(x)',
      './**/*.md', // You can disable markdown test by removing this line
      './test/**/*.[jt]s?(x)',
    ],
  },
});
