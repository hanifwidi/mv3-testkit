import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 90_000,
  outputDir: process.env.POC_OUTPUT_DIR ?? 'test-results',
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  projects: [
    { name: 'proof', testMatch: 'lifecycle.spec.ts' },
    { name: 'negative-control', testMatch: 'negative.spec.ts' },
  ],
});
