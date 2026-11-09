import { test as base } from '@playwright/test';
import { launchExtension, type LoadedExtension, type LaunchOptions } from './loader.js';

/**
 * An optional Playwright fixture. Each test gets an isolated temporary profile.
 * Use on trusted extension builds only; their code executes in a real browser.
 */
export function createMV3Test(options: LaunchOptions) {
  return base.extend<{ extension: LoadedExtension }>({
    extension: async ({}, use) => {
      const extension = await launchExtension(options);
      try { await use(extension); }
      finally { await extension.close(); }
    },
  });
}
