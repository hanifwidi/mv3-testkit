import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type BrowserContext, type Page } from '@playwright/test';
import { inspectExtension } from './manifest.js';

export interface LoadedExtension {
  readonly context: BrowserContext;
  readonly id: string;
  readonly workerURL: string;
  readonly manifest: Awaited<ReturnType<typeof inspectExtension>>['manifest'];
  newExtensionPage(path: string): Promise<Page>;
  close(): Promise<void>;
}

export interface LaunchOptions {
  extensionPath: string;
  headless?: boolean;
  executablePath?: string;
  discoveryTimeoutMs?: number;
}

export async function launchExtension(options: LaunchOptions): Promise<LoadedExtension> {
  const inspected = await inspectExtension(options.extensionPath);
  const profile = await mkdtemp(join(tmpdir(), 'mv3-core-'));
  let context: BrowserContext | undefined;
  let closed = false;
  try {
    context = await chromium.launchPersistentContext(profile, {
      channel: 'chromium',
      headless: options.headless ?? true,
      executablePath: options.executablePath,
      ignoreDefaultArgs: ['--disable-extensions'],
      args: [`--disable-extensions-except=${inspected.path}`, `--load-extension=${inspected.path}`],
    });
    const expectedSuffix = '/' + inspected.workerPath;
    const matches = (url: string) => {
      try {
        const parsed = new URL(url);
        return parsed.protocol === 'chrome-extension:' && /^[a-p]{32}$/.test(parsed.hostname) &&
          decodeURIComponent(parsed.pathname) === expectedSuffix;
      } catch { return false; }
    };
    const worker = context.serviceWorkers().find(w => matches(w.url())) ??
      await context.waitForEvent('serviceworker', {
        predicate: w => matches(w.url()),
        timeout: options.discoveryTimeoutMs ?? 15_000,
      });
    const id = new URL(worker.url()).hostname;
    const browserContext = context;
    return {
      context: browserContext, id, workerURL: worker.url(), manifest: inspected.manifest,
      async newExtensionPage(path: string) {
        if (!path || path.startsWith('/') || path.split('/').includes('..') || path.includes('?') || path.includes('#')) {
          throw new Error('Extension page must be a simple extension-local relative path');
        }
        const page = await browserContext.newPage();
        try {
          await page.goto(`chrome-extension://${id}/${path}`);
          return page;
        } catch (error) { await page.close(); throw error; }
      },
      async close() {
        if (closed) return;
        closed = true;
        const errors: unknown[] = [];
        try { await browserContext.close(); } catch (error) { errors.push(error); }
        try { await rm(profile, { recursive: true, force: true }); } catch (error) { errors.push(error); }
        if (errors.length) throw new AggregateError(errors, 'Extension cleanup failed');
      },
    };
  } catch (cause) {
    const errors: unknown[] = [cause];
    try { await context?.close(); } catch (error) { errors.push(error); }
    try { await rm(profile, { recursive: true, force: true }); } catch (error) { errors.push(error); }
    if (errors.length > 1) throw new AggregateError(errors, 'Extension launch and cleanup failed');
    throw cause;
  }
}
