import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      include: ['src/**/*.test.{ts,tsx}'],
      environment: 'node',
      setupFiles: ['./src/test/setup.ts'],
      coverage: {
        provider: 'v8',
        include: ['src/core/**/*.ts'],
        exclude: ['src/core/**/*.test.ts', 'src/core/**/index.ts'],
        reporter: ['text', 'html', 'lcov'],
        thresholds: { lines: 90, functions: 90, branches: 85, statements: 90 },
      },
    },
  }),
);
