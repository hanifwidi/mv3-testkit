import { access, rm } from 'node:fs/promises';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { chromium, type BrowserContext } from '@playwright/test';
import { launchExtension } from '../../src/core/loader.js';

vi.mock('@playwright/test', () => ({ chromium: { launchPersistentContext: vi.fn() } }));
const workerURL = `chrome-extension://${'a'.repeat(32)}/background.js`;
let profile: string;
const close = vi.fn(async () => {});
const waitForEvent = vi.fn();
beforeEach(() => {
  vi.resetAllMocks();
  profile = '';
  vi.mocked(chromium.launchPersistentContext).mockImplementation(async path => {
    profile = path;
    return { close, serviceWorkers: () => [{ url: () => workerURL }], waitForEvent } as unknown as BrowserContext;
  });
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
  expect(extension.id).toBe('a'.repeat(32));
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
    await expect(launchExtension({ extensionPath: 'test-extensions/healthy-counter', launchTimeoutMs }))
      .rejects.toThrow(/launchTimeoutMs/);
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
