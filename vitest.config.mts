import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 60000,
    hookTimeout: 60000,
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/jest-fixture/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/types.ts'],
      // Floor just under the current numbers so regressions fail CI.
      // The jsdom-only polyfill branches run in the Jest subprocess and are not counted.
      thresholds: {
        statements: 78,
        lines: 78,
        functions: 72,
        branches: 62,
      },
    },
  },
});
