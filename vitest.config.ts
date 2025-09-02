import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    environment: 'node',
    exclude: ['playwright-tests/**', 'node_modules/**'],
  },
});
