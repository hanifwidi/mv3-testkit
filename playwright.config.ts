import { defineConfig } from '@playwright/test';

// Trailing separators are stripped so `<dir>-html` stays a sibling of `<dir>`:
// an HTML folder inside a test output folder is cleared together with it.
const outputDir = process.env.POC_OUTPUT_DIR?.replace(/[\\/]+$/, '') || undefined;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 90_000,
  outputDir: outputDir ?? 'test-results',
  // A stray test.only must not silently shrink a CI run to a passing subset.
  forbidOnly: !!process.env.CI,
  workers: 1,
  retries: 0,
  // A run with its own POC_OUTPUT_DIR (e.g. the negative control after the proof
  // suite) keeps its HTML next to that directory instead of replacing playwright-report/.
  reporter: [['list'], ['html', { open: 'never', outputFolder: outputDir ? `${outputDir}-html` : 'playwright-report' }]],
  projects: [
    { name: 'proof', testMatch: 'lifecycle.spec.ts' },
    // Playwright clears a project's outputDir before running it. A separate default
    // keeps a bare `pnpm test:negative` from deleting the proof suite's evidence.
    { name: 'negative-control', testMatch: 'negative.spec.ts', outputDir: outputDir ?? 'artifacts/negative' },
    { name: 'core', testMatch: 'core*.spec.ts' },
    { name: 'phase2', testMatch: 'phase2*.spec.ts' },
  ],
});
