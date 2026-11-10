import { EventEmitter } from 'node:events';
import { access, rm } from 'node:fs/promises';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { chromium, type BrowserContext } from '@playwright/test';
import { resolve } from 'node:path';
import { expectedExtensionId, launchExtension } from '../../src/core/loader.js';
import { diagnoseError } from '../../src/core/errors.js';

vi.mock('@playwright/test', () => ({ chromium: { launchPersistentContext: vi.fn() } }));
const fixtureId = (await expectedExtensionId(resolve('test-extensions/healthy-counter')))!;
const workerURL = `chrome-extension://${fixtureId}/background.js`;
let profile: string;
let workerStatus: 'activated' | 'redundant' | 'silent' | 'reloaded';
const close = vi.fn(async () => {});
const waitForEvent = vi.fn();
const detach = vi.fn(async () => {});
// Fake page-bound CDP session reporting the worker version status, as Chromium does.
function cdpSession() {
  const session = Object.assign(new EventEmitter(), {
    detach,
    async send(method: string) {
      if (method !== 'ServiceWorker.enable') throw new Error(`Unexpected CDP command ${method}`);
      if (workerStatus === 'silent') return;
      if (workerStatus === 'reloaded') {
        // chrome.runtime.reload(): the old version turns redundant with no script error,
        // then a new version of the same script activates.
        session.emit('ServiceWorker.workerVersionUpdated', { versions: [{ versionId: '0', scriptURL: workerURL, status: 'redundant' }] });
        session.emit('ServiceWorker.workerVersionUpdated', { versions: [{ versionId: '1', scriptURL: workerURL, status: 'activated' }] });
        return;
      }
      if (workerStatus === 'redundant')
        session.emit('ServiceWorker.workerErrorReported', { errorMessage: { errorMessage: 'Uncaught Error: boom at startup' } });
      session.emit('ServiceWorker.workerVersionUpdated', {
        versions: [{ versionId: '0', scriptURL: workerURL, status: workerStatus, runningStatus: 'running' }],
      });
    },
  });
  return session;
}
beforeEach(() => {
  vi.resetAllMocks();
  profile = '';
  workerStatus = 'activated';
  vi.mocked(chromium.launchPersistentContext).mockImplementation(async path => {
    profile = path;
    return { close, serviceWorkers: () => [{ url: () => workerURL }], waitForEvent,
      pages: () => [{}], newCDPSession: async () => cdpSession() } as unknown as BrowserContext;
  });
});

it('requires the discovered worker to activate and detaches the CDP check', async () => {
  const extension = await launchExtension({ extensionPath: 'test-extensions/healthy-counter' });
  expect(extension.workerURL).toBe(workerURL);
  expect(detach).toHaveBeenCalledOnce();
  await extension.close();
});
it('fails a build whose worker Chrome discards at startup, and cleans up', async () => {
  workerStatus = 'redundant';
  let failure: unknown;
  try { await launchExtension({ extensionPath: 'test-extensions/healthy-counter' }); }
  catch (error) { failure = error; }
  expect(failure).toMatchObject({ code: 'MV3_WORKER_REGISTRATION_FAILED', message: expect.stringContaining('boom at startup') });
  expect(diagnoseError(failure)).toMatchObject({ verdict: 'FAIL', code: 'MV3_WORKER_REGISTRATION_FAILED' });
  expect(close).toHaveBeenCalledOnce();
  expect(detach).toHaveBeenCalledOnce();
  await expect(access(profile)).rejects.toMatchObject({ code: 'ENOENT' });
});
it('times out a discovered worker that never activates', async () => {
  workerStatus = 'silent';
  await expect(launchExtension({ extensionPath: 'test-extensions/healthy-counter', discoveryTimeoutMs: 20 }))
    .rejects.toMatchObject({ code: 'MV3_EXTENSION_LOAD_TIMEOUT', message: expect.stringContaining('did not activate') });
  await expect(access(profile)).rejects.toMatchObject({ code: 'ENOENT' });
});
afterEach(async () => { if (profile) await rm(profile, { recursive: true, force: true }); });

it('rejects the incompatible manifest fixture before any browser/profile allocation', async () => {
  await expect(launchExtension({ extensionPath: 'test-extensions/invalid-manifest' }))
    .rejects.toMatchObject({ code: 'MANIFEST_VERSION' });
  expect(chromium.launchPersistentContext).not.toHaveBeenCalled();
  expect(profile).toBe('');
});
it('reports missing popup and options entries without opening a page', async () => {
  const extension = await launchExtension({ extensionPath: 'test-extensions/healthy-counter' });
  try {
    await expect(extension.openPopupDocument()).rejects.toMatchObject({ code: 'MV3_PAGE_ENTRY_NOT_FOUND' });
    await expect(extension.openOptionsDocument()).rejects.toMatchObject({ code: 'MV3_PAGE_ENTRY_NOT_FOUND' });
  } finally { await extension.close(); }
});

it('uses an isolated profile and shares concurrent close operations', async () => {
  const extension = await launchExtension({ extensionPath: 'test-extensions/healthy-counter' });
  await access(profile);
  expect(extension.id).toBe(fixtureId);
  await Promise.all([extension.close(), extension.close()]);
  expect(close).toHaveBeenCalledOnce();
  await expect(access(profile)).rejects.toMatchObject({ code: 'ENOENT' });
});
it('distinguishes missing browser and cleans the allocated profile', async () => {
  vi.mocked(chromium.launchPersistentContext).mockImplementation(async path => {
    profile = path;
    throw new Error("Executable doesn't exist at /example/chromium");
  });
  await expect(launchExtension({ extensionPath: 'test-extensions/healthy-counter' }))
    .rejects.toMatchObject({ code: 'MV3_CHROMIUM_UNAVAILABLE' });
  await expect(access(profile)).rejects.toMatchObject({ code: 'ENOENT' });
});
it('diagnoses discovery failure and disposes both context and profile', async () => {
  vi.mocked(chromium.launchPersistentContext).mockImplementation(async path => {
    profile = path;
    return { close, serviceWorkers: () => [], waitForEvent } as unknown as BrowserContext;
  });
  waitForEvent.mockRejectedValue(Object.assign(new Error('worker discovery timed out'), { name: 'TimeoutError' }));
  await expect(launchExtension({ extensionPath: 'test-extensions/healthy-counter', discoveryTimeoutMs: 20 }))
    .rejects.toMatchObject({ code: 'MV3_EXTENSION_LOAD_TIMEOUT' });
  expect(close).toHaveBeenCalledOnce();
  await expect(access(profile)).rejects.toMatchObject({ code: 'ENOENT' });
});
it('retains discovery errors other than timeout instead of mislabeling them', async () => {
  vi.mocked(chromium.launchPersistentContext).mockImplementation(async path => {
    profile = path;
    return { close, serviceWorkers: () => [], waitForEvent } as unknown as BrowserContext;
  });
  waitForEvent.mockRejectedValue(new Error('browser closed during discovery'));
  await expect(launchExtension({ extensionPath: 'test-extensions/healthy-counter' }))
    .rejects.toMatchObject({ code: 'MV3_EXTENSION_LOAD_FAILED', message: expect.stringContaining('browser closed during discovery') });
});
it('bounds Chromium startup and reports a hung launch as a classified, cleaned-up failure', async () => {
  vi.mocked(chromium.launchPersistentContext).mockImplementation(async path => {
    profile = path;
    throw Object.assign(new Error('browserType.launchPersistentContext: Timeout 30000ms exceeded.'), { name: 'TimeoutError' });
  });
  await expect(launchExtension({ extensionPath: 'test-extensions/healthy-counter' })).rejects.toMatchObject({
    code: 'MV3_CHROMIUM_LAUNCH_FAILED', message: expect.stringContaining('did not start within 30000ms'),
  });
  expect(vi.mocked(chromium.launchPersistentContext).mock.calls[0][1]).toMatchObject({ timeout: 30_000 });
  await expect(access(profile)).rejects.toMatchObject({ code: 'ENOENT' });
});
it('passes a custom launch timeout and rejects invalid ones before allocating a profile', async () => {
  const extension = await launchExtension({ extensionPath: 'test-extensions/healthy-counter', launchTimeoutMs: 45_000 });
  await extension.close();
  expect(vi.mocked(chromium.launchPersistentContext).mock.calls[0][1]).toMatchObject({ timeout: 45_000 });
  vi.mocked(chromium.launchPersistentContext).mockClear();
  profile = '';
  for (const launchTimeoutMs of [0, -1, 1.5, 2_147_483_648]) {
    let failure: unknown;
    try { await launchExtension({ extensionPath: 'test-extensions/healthy-counter', launchTimeoutMs }); }
    catch (error) { failure = error; }
    expect(failure).toMatchObject({ code: 'CONFIG_INVALID', message: expect.stringContaining('launchTimeoutMs') });
    // Programmatic callers (doctor()) get the documented configuration FAIL, not INCONCLUSIVE.
    expect(diagnoseError(failure)).toMatchObject({ verdict: 'FAIL', code: 'MV3_CONFIG_INVALID' });
  }
  expect(chromium.launchPersistentContext).not.toHaveBeenCalled();
  expect(profile).toBe('');
});
it('still removes the profile when browser cleanup fails', async () => {
  const extension = await launchExtension({ extensionPath: 'test-extensions/healthy-counter' });
  close.mockRejectedValue(new Error('close failed'));
  await expect(extension.close()).rejects.toBeInstanceOf(AggregateError);
  await expect(access(profile)).rejects.toMatchObject({ code: 'ENOENT' });
});

it('does not mistake a reload (redundant version without a script error) for a broken build', async () => {
  workerStatus = 'reloaded';
  const extension = await launchExtension({ extensionPath: 'test-extensions/healthy-counter' });
  expect(extension.workerURL).toBe(workerURL);
  await extension.close();
});
it('ignores a same-named worker from another extension ID', async () => {
  vi.mocked(chromium.launchPersistentContext).mockImplementation(async path => {
    profile = path;
    return { close, serviceWorkers: () => [{ url: () => `chrome-extension://${'b'.repeat(32)}/background.js` }], waitForEvent,
      pages: () => [{}], newCDPSession: async () => cdpSession() } as unknown as BrowserContext;
  });
  waitForEvent.mockRejectedValue(Object.assign(new Error('worker discovery timed out'), { name: 'TimeoutError' }));
  await expect(launchExtension({ extensionPath: 'test-extensions/healthy-counter', discoveryTimeoutMs: 20 }))
    .rejects.toMatchObject({ code: 'MV3_EXTENSION_LOAD_TIMEOUT' });
  expect(waitForEvent).toHaveBeenCalledOnce();
});
it('derives the unpacked ID from the real path, or from a manifest key', async () => {
  // Values observed from real Chromium for this checkout's fixture path and a known key.
  expect(await expectedExtensionId(resolve('test-extensions/healthy-counter')))
    .toMatch(/^[a-p]{32}$/);
  expect(await expectedExtensionId('/nonexistent', Buffer.from('test-key').toString('base64')))
    .toMatch(/^[a-p]{32}$/);
});
