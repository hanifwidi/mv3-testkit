import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './tests/mv3', workers: 1, retries: 0, timeout: 90000 });
