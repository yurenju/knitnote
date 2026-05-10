// vitest.config.ts
import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';
export default defineConfig({
  plugins: [preact()],
  test: {
    globals: false,
    environment: 'node',
    exclude: ['tests/e2e/**', 'node_modules/**', 'dist/**']
  }
});
