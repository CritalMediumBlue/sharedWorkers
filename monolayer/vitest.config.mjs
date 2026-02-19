import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      enabled: true,
      reporter: ['html', 'text'],
      provider: 'v8', // use built-in v8 provider instead of c8
      reportOnFailure: true, // Generate coverage report even when tests fail
    },
    timeout: 20000,
  },
});