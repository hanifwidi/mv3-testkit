import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';
import { initProject } from '../../src/cli/init.js';

const extension = resolve('test-extensions/healthy-counter');
it('creates a starter using JSON-safe paths and refuses a second overwrite', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mv3-init-'));
  const root = join(dir, 'project "quoted"');
  try {
    expect(await initProject(extension, root)).toMatchObject({ code: 'MV3_INIT_CREATED', verdict: 'PASS' });
    const json = await readFile(join(root, 'mv3-testkit.config.json'), 'utf8');
    expect(resolve(root, JSON.parse(json).extensionPath)).toBe(extension);
    await expect(initProject(extension, root)).rejects.toMatchObject({ code: 'MV3_INIT_EXISTS' });
    expect(await readFile(join(root, 'mv3-testkit.config.json'), 'utf8')).toBe(json);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
it('checks the whole file plan before writing and preserves user content', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mv3-init-existing-'));
  try {
    await writeFile(join(root, 'playwright.mv3.config.mjs'), 'user file');
    await expect(initProject(extension, root)).rejects.toMatchObject({ code: 'MV3_INIT_EXISTS' });
    await expect(access(join(root, 'mv3-testkit.config.json'))).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readFile(join(root, 'playwright.mv3.config.mjs'), 'utf8')).toBe('user file');
  } finally { await rm(root, { recursive: true, force: true }); }
});
it('rejects invalid builds before creating a target directory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mv3-init-invalid-'));
  try {
    const target = join(root, 'project');
    await expect(initProject(resolve('test-extensions/invalid-manifest'), target)).rejects.toMatchObject({ code: 'MANIFEST_VERSION' });
    await expect(access(target)).rejects.toMatchObject({ code: 'ENOENT' });
  } finally { await rm(root, { recursive: true, force: true }); }
});
it('does not follow a project-internal symlink to write outside the project', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mv3-init-symlink-'));
  try {
    const project = join(root, 'project'), outside = join(root, 'outside');
    await mkdir(project); await mkdir(outside);
    await symlink(outside, join(project, 'tests'));
    await expect(initProject(extension, project)).rejects.toMatchObject({ code: 'MV3_INIT_PATH_INVALID' });
    expect(await readdir(outside)).toEqual([]);
    await expect(access(join(project, 'mv3-testkit.config.json'))).rejects.toMatchObject({ code: 'ENOENT' });
  } finally { await rm(root, { recursive: true, force: true }); }
});
