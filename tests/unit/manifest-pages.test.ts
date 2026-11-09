import { mkdtemp, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { inspectExtension } from '../../src/core/manifest.js';

async function fixture(overrides: Record<string, unknown>) {
  const dir = await mkdtemp(join(tmpdir(), 'mv3-pages-'));
  await writeFile(join(dir, 'worker.js'), '// test fixture');
  await writeFile(join(dir, 'page.html'), '<title>Test</title>');
  await writeFile(join(dir, 'manifest.json'), JSON.stringify({
    name: 'Test', version: '1', manifest_version: 3, background: { service_worker: 'worker.js' }, ...overrides,
  }));
  return dir;
}
it.each(['1', '1.2', '1.2.3', '1.2.3.4', '65535.0'])(
  'accepts valid Chrome version %s', async version => {
    const dir = await fixture({ version });
    try { expect((await inspectExtension(dir)).manifest.version).toBe(version); }
    finally { await rm(dir, { recursive: true, force: true }); }
  },
);
it.each(['0', '0.0.0', '01.2.3', '65536', '1.2.3.4.5', '1.2.-1'])(
  'rejects invalid Chrome version %s', async version => {
    const dir = await fixture({ version });
    try { await expect(inspectExtension(dir)).rejects.toMatchObject({ code: 'MANIFEST_IDENTITY' }); }
    finally { await rm(dir, { recursive: true, force: true }); }
  },
);
it('verifies declared popup and options documents', async () => {
  const dir = await fixture({ action: { default_popup: 'page.html' }, options_page: 'page.html', options_ui: { page: 'page.html' } });
  try { expect((await inspectExtension(dir)).manifest.action?.default_popup).toBe('page.html'); }
  finally { await rm(dir, { recursive: true, force: true }); }
});
it.each([
  { action: { default_popup: 'missing.html' } }, { options_page: '../escape.html' },
  { options_ui: {} }, { options_ui: { page: 'https://example.com' } }, { action: [] },
])('rejects invalid or missing page entries: %j', async overrides => {
  const dir = await fixture(overrides);
  try { await expect(inspectExtension(dir)).rejects.toThrow(/(page|action)/i); }
  finally { await rm(dir, { recursive: true, force: true }); }
});
it('rejects declared page symlinks outside the extension root', async () => {
  const dir = await fixture({ options_page: 'outside.html' });
  const outside = await mkdtemp(join(tmpdir(), 'mv3-outside-page-'));
  try {
    await writeFile(join(outside, 'page.html'), '<title>Outside</title>');
    await symlink(join(outside, 'page.html'), join(dir, 'outside.html'));
    await expect(inspectExtension(dir)).rejects.toMatchObject({ code: 'PAGE_ENTRY_UNREADABLE' });
  } finally {
    await rm(dir, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});
