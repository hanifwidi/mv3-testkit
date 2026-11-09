import { expect, it, vi } from 'vitest';
import type { BrowserContext, Page } from '@playwright/test';
import { readExtensionStorage, type StorageArea } from '../../src/core/page-helpers.js';

const id = 'a'.repeat(32);
function setup() {
  const context = {} as BrowserContext;
  const evaluate = vi.fn(async () => ({ counter: 1 }));
  const page = { url: () => `chrome-extension://${id}/popup.html`, context: () => context, evaluate } as unknown as Page;
  return { context, page, id, hasStoragePermission: true, keys: ['counter'], area: 'local' as StorageArea, evaluate };
}
it('requests only explicit keys without logging or mutating storage', async () => {
  const opts = setup();
  expect(await readExtensionStorage(opts)).toEqual({ counter: 1 });
  expect(opts.evaluate).toHaveBeenCalledWith(expect.any(Function), { id, keys: ['counter'], area: 'local' });
});
it.each([null, [], [''], [1]])('refuses whole-storage or invalid reads: %j', async keys => {
  const opts = setup();
  await expect(readExtensionStorage({ ...opts, keys: keys as string[] }))
    .rejects.toMatchObject({ code: 'MV3_STORAGE_KEYS_INVALID' });
  expect(opts.evaluate).not.toHaveBeenCalled();
});
it('refuses pages from another browser profile even with the same extension URL', async () => {
  const opts = setup();
  await expect(readExtensionStorage({ ...opts, context: {} as BrowserContext }))
    .rejects.toMatchObject({ code: 'MV3_STORAGE_CONTEXT_INVALID' });
  expect(opts.evaluate).not.toHaveBeenCalled();
});
it('refuses website main worlds and other extension origins', async () => {
  for (const url of ['http://127.0.0.1/', `chrome-extension://${'b'.repeat(32)}/popup.html`]) {
    const opts = setup();
    const page = { ...opts.page, url: () => url } as Page;
    await expect(readExtensionStorage({ ...opts, page })).rejects.toMatchObject({ code: 'MV3_STORAGE_CONTEXT_INVALID' });
    expect(opts.evaluate).not.toHaveBeenCalled();
  }
});
it('requires declared permission and preserves evaluation failures as causes', async () => {
  const opts = setup();
  await expect(readExtensionStorage({ ...opts, hasStoragePermission: false }))
    .rejects.toMatchObject({ code: 'MV3_STORAGE_PERMISSION_MISSING' });
  const cause = new Error('context closed');
  opts.evaluate.mockRejectedValue(cause);
  await expect(readExtensionStorage(opts)).rejects.toMatchObject({ code: 'MV3_STORAGE_READ_FAILED', cause });
});
