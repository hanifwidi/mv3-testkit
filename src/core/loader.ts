import { createHash } from 'node:crypto';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type BrowserContext, type Page } from '@playwright/test';
import { cleanupAll } from '../resource-cleanup.js';
import { MV3ConfigError } from './config.js';
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
    throw new MV3ConfigError('CONFIG_INVALID', `${name} must be an integer from 1 to 2147483647`);
  return timeout;
}

/**
 * Chromium creates (and Playwright reports) the worker target even when the
 * script throws during evaluation and the registration is discarded, so a
 * discovered URL does not prove a usable worker: require 'activated'.
 */
async function waitForActivation(context: BrowserContext, workerURL: string, timeoutMs: number): Promise<void> {
  const existing = context.pages()[0];
  const page = existing ?? await context.newPage();
  let failed = false;
  try {
    const session = await context.newCDPSession(page);
    try {
      const errors: string[] = [];
      await new Promise<void>((resolve, reject) => {
        let settled = false;
        const finish = (error?: unknown) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (error === undefined) resolve(); else reject(error);
        };
        const timer = setTimeout(() => finish(Object.assign(
          new Error(`Worker did not activate within ${timeoutMs}ms`), { name: 'TimeoutError' })), timeoutMs);
        // A version can also turn redundant without any script error, e.g. when
        // the extension calls chrome.runtime.reload(); a newer version then
        // activates. Only a redundant version plus Chrome's error report is a
        // build failure; otherwise keep waiting (a stall ends as a timeout).
        let redundant = false;
        const failIfBroken = () => {
          if (redundant && errors.length) finish(new MV3RuntimeError('MV3_WORKER_REGISTRATION_FAILED',
            `The extension worker failed to register: ${errors.join('; ')}`));
        };
        session.on('ServiceWorker.workerErrorReported', ({ errorMessage }) => {
          if (errorMessage.errorMessage && !errors.includes(errorMessage.errorMessage)) errors.push(errorMessage.errorMessage);
          failIfBroken();
        });
        session.on('ServiceWorker.workerVersionUpdated', ({ versions }) => {
          for (const version of versions) {
            if (version.scriptURL !== workerURL) continue;
            if (version.status === 'activated') return finish();
            if (version.status === 'redundant') redundant = true;
          }
          failIfBroken();
        });
        session.send('ServiceWorker.enable').catch(finish);
      });
    } catch (error) {
      failed = true;
      throw error;
    } finally {
      try { await session.detach(); } catch (error) { if (!failed) throw error; }
    }
  } finally {
    if (!existing) {
      try { await page.close(); } catch (error) { if (!failed) throw error; }
    }
  }
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

/**
 * Chromium's ID for an unpacked extension: SHA-256 of the manifest key, or of
 * the extension directory's real path, first 32 hex digits mapped 0-f to a-p.
 * Windows hashes a differently encoded path, so the check is skipped there.
 */
export async function expectedExtensionId(path: string, key?: unknown): Promise<string | undefined> {
  const source = typeof key === 'string' && key ? Buffer.from(key, 'base64')
    : process.platform === 'win32' ? undefined : await realpath(path);
  if (source === undefined) return undefined;
  return [...createHash('sha256').update(source).digest('hex').slice(0, 32)]
    .map(digit => String.fromCharCode(97 + parseInt(digit, 16))).join('');
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
  let phase: 'launch' | 'discovery' | 'activation' = 'launch';
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
    // Bind discovery to the extension Chromium loaded from this path, not any
    // extension (component, policy, headed profile) with a same-named worker.
    const expectedId = await expectedExtensionId(inspected.path, (inspected.manifest as { key?: unknown }).key);
    const match = (url: string) => isTargetWorker(url, inspected.workerPath) &&
      (!expectedId || new URL(url).hostname === expectedId);
    const worker = current.serviceWorkers().find(w => match(w.url())) ??
      await current.waitForEvent('serviceworker', { predicate: w => match(w.url()), timeout: discoveryTimeoutMs });
    phase = 'activation';
    await waitForActivation(current, worker.url(), discoveryTimeoutMs);
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
    const error = cause instanceof MV3RuntimeError ? cause : new MV3RuntimeError(phase !== 'launch' ?
      timedOut ? 'MV3_EXTENSION_LOAD_TIMEOUT' : 'MV3_EXTENSION_LOAD_FAILED' :
      unavailable ? 'MV3_CHROMIUM_UNAVAILABLE' : 'MV3_CHROMIUM_LAUNCH_FAILED',
      phase === 'discovery' ? `Worker discovery failed for ${inspected.workerPath}: ${detail}` :
        phase === 'activation' ? `Worker ${inspected.workerPath} did not activate: ${detail}` :
          unavailable ? 'Playwright Chromium is missing; run pnpm exec playwright install --with-deps chromium' :
            timedOut ? `Chromium did not start within ${launchTimeoutMs}ms: ${detail}` :
              `Chromium could not launch: ${detail}`, { cause });
    try { await dispose(); }
    catch (cleanupError) { throw new AggregateError([error, cleanupError], 'Extension launch and cleanup failed'); }
    throw error;
  }
}
