import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';
import { resolveConfig, loadConfig } from '../../src/core/config.js';

it('resolves extension paths against the configuration directory and supplies defaults', () => {
  expect(resolveConfig({ extensionPath: './build' }, '/tmp/project')).toEqual({
    extensionPath: '/tmp/project/build', headless: true, discoveryTimeoutMs: 15_000, launchTimeoutMs: 30_000,
  });
  expect(resolveConfig({ extensionPath: '.', headless: false, discoveryTimeoutMs: 20, launchTimeoutMs: 40 })).toEqual({
    extensionPath: resolve('.'), headless: false, discoveryTimeoutMs: 20, launchTimeoutMs: 40,
  });
});

it.each([
  null, [], {}, { extensionPath: '' }, { extensionPath: 1 },
  { extensionPath: '.', headless: 'true' }, { extensionPath: '.', timeout: 1 },
  ...[0, -1, 1.5, NaN, Infinity, 2_147_483_648].map(discoveryTimeoutMs => ({ extensionPath: '.', discoveryTimeoutMs })),
  ...[0, -1, 1.5, '30000', 2_147_483_648].map(launchTimeoutMs => ({ extensionPath: '.', launchTimeoutMs })),
])('rejects invalid configuration: %j', value => {
  expect(() => resolveConfig(value)).toThrow();
});

it('loads JSON relative to its file and reports malformed/unreadable JSON', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mv3-config-'));
  try {
    const file = join(dir, 'config.json');
    await writeFile(file, JSON.stringify({ extensionPath: 'dist' }));
    expect((await loadConfig(file)).extensionPath).toBe(join(dir, 'dist'));
    await writeFile(file, '{broken');
    await expect(loadConfig(file)).rejects.toMatchObject({ code: 'CONFIG_UNREADABLE' });
    await expect(loadConfig(join(dir, 'missing.json'))).rejects.toMatchObject({ code: 'CONFIG_UNREADABLE' });
  } finally { await rm(dir, { recursive: true, force: true }); }
});
