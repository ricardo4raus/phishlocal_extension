// Separate from vite.config.ts on purpose: the crx plugin must not run during tests.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
