import type { BrowserContext, Page } from '@playwright/test';

export type StorageArea = 'local' | 'session';
export class MV3ContextError extends Error {
  constructor(readonly code: 'MV3_PAGE_ENTRY_NOT_FOUND' | 'MV3_STORAGE_CONTEXT_INVALID' |
    'MV3_STORAGE_KEYS_INVALID' | 'MV3_STORAGE_PERMISSION_MISSING' | 'MV3_STORAGE_READ_FAILED',
    message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'MV3ContextError';
  }
}

/** Reads only explicitly requested keys. Does not log, snapshot or mutate data. */
export async function readExtensionStorage(options: {
  context: BrowserContext; id: string; hasStoragePermission: boolean;
  page: Page; keys: readonly string[]; area: StorageArea;
}): Promise<Record<string, unknown>> {
  const { context, id, page, keys, area } = options;
  if (!Array.isArray(keys) || keys.length === 0 || keys.some(key => typeof key !== 'string' || !key))
    throw new MV3ContextError('MV3_STORAGE_KEYS_INVALID', 'Supply a nonempty explicit array of storage keys');
  if (area !== 'local' && area !== 'session')
    throw new MV3ContextError('MV3_STORAGE_KEYS_INVALID', 'Only local and session storage are supported');
  if (!options.hasStoragePermission)
    throw new MV3ContextError('MV3_STORAGE_PERMISSION_MISSING', 'The extension must explicitly declare the storage permission');
  let url: URL;
  try { url = new URL(page.url()); }
  catch { throw new MV3ContextError('MV3_STORAGE_CONTEXT_INVALID', 'Expected an extension document'); }
  if (page.context() !== context || url.protocol !== 'chrome-extension:' || url.hostname !== id)
    throw new MV3ContextError('MV3_STORAGE_CONTEXT_INVALID', 'Use a document belonging to this loaded extension and profile');

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      page.evaluate(async ({ id, keys, area }) => {
        // Recheck inside the execution context in case navigation raced the caller.
        if (location.protocol !== 'chrome-extension:' || location.hostname !== id)
          throw new Error('Document navigated away from the loaded extension');
        if (!chrome.storage?.[area]) throw new Error('Storage API is unavailable in this context');
        return chrome.storage[area].get(keys);
      }, { id, keys: [...keys], area }),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Storage read timed out after 10000ms')), 10_000);
      }),
    ]);
  } catch (cause) {
    throw new MV3ContextError('MV3_STORAGE_READ_FAILED', 'Extension storage read failed', { cause });
  } finally { clearTimeout(timer); }
}
