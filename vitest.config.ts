import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  // Monorepo workspace 配置
  // 每个包可以有自己的 vitest.config.ts，也可以继承根配置
  resolve: {
    alias: {
      '@aether/shared': resolve(__dirname, 'packages/shared/src'),
      '@aether/core': resolve(__dirname, 'packages/core/src'),
      '@aether/memory': resolve(__dirname, 'packages/memory/src'),
      '@aether/model-router': resolve(__dirname, 'packages/model-router/src'),
      '@aether/mcp': resolve(__dirname, 'packages/mcp/src'),
      '@aether/scheduler': resolve(__dirname, 'packages/scheduler/src'),
      '@aether/cli': resolve(__dirname, 'packages/cli/src'),
      '@aether/a2a': resolve(__dirname, 'packages/a2a/src'),
      '@aether/sandbox': resolve(__dirname, 'packages/sandbox/src'),
      '@aether/workflow': resolve(__dirname, 'packages/workflow/src'),
      '@aether/web': resolve(__dirname, 'packages/web/src'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/*/src/**/*.test.ts', 'packages/*/__tests__/**/*.test.ts', '__tests__/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['**/*.d.ts', '**/dist/**', '**/node_modules/**'],
    },
  },
});
