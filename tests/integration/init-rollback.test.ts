import { access, mkdtemp, readdir, rm } from 'node:fs/promises';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { initProject } from '../../src/cli/init.js';

// Real filesystem; only the second file write is made to fail, as a full disk
// or file-size limit would, after the exclusive create already succeeded.
vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, open: vi.fn(actual.open) };
});
const extension = resolve('test-extensions/healthy-counter');
afterEach(() => { vi.mocked(fs.open).mockReset(); });

it('rolls back a file whose write failed and the directories it created, so init can be retried', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'mv3-init-rollback-'));
  const root = join(parent, 'project');
  const actualOpen = (await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')).open;
  let opened = 0;
  vi.mocked(fs.open).mockImplementation(async (...args: Parameters<typeof actualOpen>) => {
    const handle = await actualOpen(...args);
    if (++opened !== 2) return handle;
    return new Proxy(handle, {
      get: (target, key) => key === 'writeFile'
        ? async () => { throw Object.assign(new Error('EFBIG: file too large, write'), { code: 'EFBIG' }); }
        : typeof Reflect.get(target, key) === 'function' ? Reflect.get(target, key).bind(target) : Reflect.get(target, key),
    });
  });
  try {
    await expect(initProject(extension, root)).rejects.toMatchObject({ code: 'MV3_INIT_FAILED' });
    // Nothing init created is left behind: no empty file and no empty directories.
    await expect(access(root)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readdir(parent)).toEqual([]);
    vi.mocked(fs.open).mockImplementation(actualOpen);
    await expect(initProject(extension, root)).resolves.toMatchObject({ code: 'MV3_INIT_CREATED' });
  } finally { await rm(parent, { recursive: true, force: true }); }
});
