import { test as base } from '@playwright/test';
import { launchExtension, type LoadedExtension, type LaunchOptions } from './loader.js';

/**
 * An optional Playwright fixture. Each test gets an isolated temporary profile.
 * Use on trusted extension builds only; their code executes in a real browser.
 */
export function createMV3Test(options: LaunchOptions) {
  return base.extend<{ extension: LoadedExtension }>({
    extension: async ({}, use, info) => {
      const headless = process.env.MV3TK_HEADED === '1' ? false : info.project.use.headless ?? options.headless;
      const extension = await launchExtension({ ...options, headless });
      const version = extension.context.browser()?.version();
      if (version) info.annotations.push({ type: 'mv3:browserVersion', description: version });
      info.annotations.push({ type: 'mv3:extensionId', description: extension.id });
      try { await use(extension); }
      finally { await extension.close(); }
    },
  });
}
