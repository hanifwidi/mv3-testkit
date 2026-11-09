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
it('still removes the profile when browser cleanup fails', async () => {
  const extension = await launchExtension({ extensionPath: 'test-extensions/healthy-counter' });
  close.mockRejectedValue(new Error('close failed'));
  await expect(extension.close()).rejects.toBeInstanceOf(AggregateError);
  await expect(access(profile)).rejects.toMatchObject({ code: 'ENOENT' });
});
