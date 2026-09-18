import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['electron/**/*.test.ts', 'src/**/*.test.tsx', 'src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        'release/',
        'extension/**',
        'extension-firefox/**',
        'scripts/**',
        'electron/preload.ts',
        'electron/**/*.test.ts',
        'src/main.tsx',
      ],
      thresholds: {
        lines: 10,
        functions: 53,
        branches: 60,
        statements: 10,
      },
    },
    setupFiles: ['./vitest.setup.ts'],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
