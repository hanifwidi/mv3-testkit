import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type BrowserContext, type Page } from '@playwright/test';
import { cleanupAll } from '../resource-cleanup.js';
import { inspectExtension } from './manifest.js';
import { MV3RuntimeError } from './errors.js';
import { MV3ContextError, readExtensionStorage, type StorageArea } from './page-helpers.js';

export interface LoadedExtension {
  readonly context: BrowserContext;
  readonly id: string;
  readonly workerURL: string;
  readonly manifest: Awaited<ReturnType<typeof inspectExtension>>['manifest'];
  newExtensionPage(path: string): Promise<Page>;
  openPopupDocument(): Promise<Page>;
  openOptionsDocument(): Promise<Page>;
  readStorage(page: Page, keys: readonly string[], area?: StorageArea): Promise<Record<string, unknown>>;
  close(): Promise<void>;
}

export interface LaunchOptions {
  extensionPath: string;
  headless?: boolean;
  executablePath?: string;
  discoveryTimeoutMs?: number;
  /** Bounds Chromium startup. Playwright's own default (180 s) outlasts typical test timeouts. */
  launchTimeoutMs?: number;
}

function boundedTimeout(name: string, value: number | undefined, fallback: number): number {
  const timeout = value ?? fallback;
  if (!Number.isSafeInteger(timeout) || timeout <= 0 || timeout > 2_147_483_647)
    throw new RangeError(`${name} must be an integer from 1 to 2147483647`);
  return timeout;
}

export function extensionPageURL(id: string, path: string): string {
  if (!/^[a-p]{32}$/.test(id)) throw new TypeError('Invalid Chrome extension ID');
  // Deliberately restrictive: tests should navigate only to extension-local HTML,
  // never to chrome-extension://<id>//host or escaped external destinations.
  if (!path || !/^[A-Za-z0-9_./-]+$/.test(path) || path.startsWith('/') ||
      path.split('/').some(segment => !segment || segment === '.' || segment === '..')) {
    throw new TypeError('Extension page must be a plain relative extension-local path');
  }
  return `chrome-extension://${id}/${path}`;
}

function isTargetWorker(url: string, workerPath: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'chrome-extension:' && /^[a-p]{32}$/.test(parsed.hostname) &&
      decodeURIComponent(parsed.pathname) === '/' + workerPath;
  } catch { return false; }
}

/**
 * Execute only trusted builds. Chrome extension code runs with its declared
 * permissions in a newly isolated temporary browser profile.
 */
export async function launchExtension(options: LaunchOptions): Promise<LoadedExtension> {
  const inspected = await inspectExtension(options.extensionPath);
  const discoveryTimeoutMs = boundedTimeout('discoveryTimeoutMs', options.discoveryTimeoutMs, 15_000);
  const launchTimeoutMs = boundedTimeout('launchTimeoutMs', options.launchTimeoutMs, 30_000);

  const profile = await mkdtemp(join(tmpdir(), 'mv3-core-'));
  let context: BrowserContext | undefined;
  let phase: 'launch' | 'discovery' = 'launch';
  const dispose = async () => cleanupAll([
    { name: 'browser context', close: async () => { await context?.close(); } },
    { name: 'temporary profile', close: async () => { await rm(profile, { recursive: true, force: true }); } },
  ]);
  try {
    context = await chromium.launchPersistentContext(profile, {
      channel: 'chromium',
      headless: options.headless ?? true,
      executablePath: options.executablePath,
      // A hung launch fails as a classified diagnostic and still removes the
      // profile, instead of surfacing only as an outer test timeout.
      timeout: launchTimeoutMs,
      ignoreDefaultArgs: ['--disable-extensions'],
      args: [`--disable-extensions-except=${inspected.path}`, `--load-extension=${inspected.path}`],
    });
    phase = 'discovery';
    const current = context;
    const match = (url: string) => isTargetWorker(url, inspected.workerPath);
    const worker = current.serviceWorkers().find(w => match(w.url())) ??
      await current.waitForEvent('serviceworker', { predicate: w => match(w.url()), timeout: discoveryTimeoutMs });
    const id = new URL(worker.url()).hostname;
    let closing: Promise<void> | undefined;
    const openPage = async (path: string): Promise<Page> => {
      const url = extensionPageURL(id, path);
      if (closing) throw new Error('Cannot create a page after extension cleanup started');
      const page = await current.newPage();
      try {
        await page.goto(url);
        return page;
      } catch (cause) {
        try { await page.close(); }
        catch (closeError) { throw new AggregateError([cause, closeError], 'Page navigation and cleanup failed'); }
        throw cause;
      }
    };
    return {
      context: current, id, workerURL: worker.url(), manifest: inspected.manifest,
      newExtensionPage: openPage,
      async openPopupDocument() {
        const path = inspected.manifest.action?.default_popup;
        if (!path) throw new MV3ContextError('MV3_PAGE_ENTRY_NOT_FOUND', 'Manifest has no popup document');
        return openPage(path);
      },
      async openOptionsDocument() {
        const path = inspected.manifest.options_ui?.page ?? inspected.manifest.options_page;
        if (!path) throw new MV3ContextError('MV3_PAGE_ENTRY_NOT_FOUND', 'Manifest has no options document');
        return openPage(path);
      },
      async readStorage(page, keys, area = 'local') {
        if (closing) throw new MV3ContextError('MV3_STORAGE_CONTEXT_INVALID', 'Extension cleanup has started');
        return readExtensionStorage({ context: current, id, page, keys, area,
          hasStoragePermission: inspected.manifest.permissions?.includes('storage') ?? false });
      },
      close(): Promise<void> {
        // Concurrent callers share cleanup success/failure instead of skipping it.
        return closing ??= dispose();
      },
    };
  } catch (cause) {
    const unavailable = cause instanceof Error && /Executable doesn't exist/.test(cause.message);
    const timedOut = cause instanceof Error && cause.name === 'TimeoutError';
    const detail = cause instanceof Error ? cause.message : String(cause);
    const error = new MV3RuntimeError(phase === 'discovery' ?
      timedOut ? 'MV3_EXTENSION_LOAD_TIMEOUT' : 'MV3_EXTENSION_LOAD_FAILED' :
      unavailable ? 'MV3_CHROMIUM_UNAVAILABLE' : 'MV3_CHROMIUM_LAUNCH_FAILED',
      phase === 'discovery' ? `Worker discovery failed for ${inspected.workerPath}: ${detail}` :
        unavailable ? 'Playwright Chromium is missing; run pnpm exec playwright install --with-deps chromium' :
          timedOut ? `Chromium did not start within ${launchTimeoutMs}ms: ${detail}` :
            `Chromium could not launch: ${detail}`, { cause });
    try { await dispose(); }
    catch (cleanupError) { throw new AggregateError([error, cleanupError], 'Extension launch and cleanup failed'); }
    throw error;
  }
}
