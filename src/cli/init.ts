import { lstat, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { inspectExtension } from '../core/manifest.js';

export class MV3InitError extends Error {
  constructor(readonly code: 'MV3_INIT_EXISTS' | 'MV3_INIT_PATH_INVALID' | 'MV3_INIT_FAILED', message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'MV3InitError';
  }
}

async function existing(path: string) {
  try { return await lstat(path); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
}

export async function initProject(extensionPath: string, directory = process.cwd()) {
  const extension = await inspectExtension(extensionPath);
  const root = resolve(directory);
  const files: Record<string, string> = {
    'mv3-testkit.config.json': JSON.stringify({ extensionPath: relative(root, extension.path) || '.' }, null, 2) + '\n',
    'playwright.mv3.config.mjs': `import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './tests/mv3', workers: 1, retries: 0, timeout: 90000, forbidOnly: !!process.env.CI });
`,
    'tests/mv3/extension.spec.mjs': `import { expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { createMV3Test, loadConfig } from 'mv3-testkit';
const config = await loadConfig(fileURLToPath(new URL('../../mv3-testkit.config.json', import.meta.url)));
const test = createMV3Test(config);
test('loads the unpacked extension and discovers its worker', async ({ extension }) => {
  expect(extension.id).toMatch(/^[a-p]{32}$/);
  expect(extension.workerURL).toContain('chrome-extension://' + extension.id + '/');
  // Add lifecycle checks only when the test build supplies an explicit boot identity.
});
`,
  };
  // Check the complete plan before creating anything. Never follow project-internal
  // directory symlinks or overwrite an existing file, even on a second invocation.
  for (const dir of [root, join(root, 'tests'), join(root, 'tests/mv3')]) {
    const entry = await existing(dir);
    if (entry && (!entry.isDirectory() || entry.isSymbolicLink()))
      throw new MV3InitError('MV3_INIT_PATH_INVALID', `Expected a directory without a symlink: ${dir}`);
  }
  for (const file of Object.keys(files)) {
    if (await existing(join(root, file)))
      throw new MV3InitError('MV3_INIT_EXISTS', `Refusing to overwrite ${join(root, file)}`);
  }
  const created: string[] = [];
  try {
    await mkdir(join(root, 'tests/mv3'), { recursive: true });
    for (const [file, contents] of Object.entries(files)) {
      await writeFile(join(root, file), contents, { flag: 'wx' });
      created.push(file);
    }
  } catch (cause) {
    const errors: unknown[] = [cause];
    for (const file of created.reverse()) {
      try {
        // Preserve a file if another process edited it after creation.
        if (await readFile(join(root, file), 'utf8') === files[file]) await rm(join(root, file));
      } catch (error) { errors.push(error); }
    }
    if (errors.length > 1) throw new AggregateError(errors, 'Initialization and rollback failed');
    throw new MV3InitError('MV3_INIT_FAILED', `Initialization failed: ${String(cause)}`, { cause });
  }
  return { schemaVersion: 1, verdict: 'PASS', code: 'MV3_INIT_CREATED', directory: root,
    files: Object.keys(files), message: 'Created starter files. Run mv3tk test; add mv3-reports/ to your ignore rules.' };
}
