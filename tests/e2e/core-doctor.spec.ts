import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { test, expect } from '@playwright/test';

const run = promisify(execFile);
const cli = resolve('bin/mv3tk.mjs');

test('built doctor CLI loads JSON config relative to its file and discovers a real extension worker', async ({}, info) => {
  const dir = await mkdtemp(join(tmpdir(), 'mv3-doctor-e2e-'));
  try {
    const file = join(dir, 'mv3-testkit.config.json');
    await writeFile(file, JSON.stringify({ extensionPath: relative(dir, resolve('test-extensions/healthy-counter')) }));
    const { stdout } = await run(process.execPath, [cli, 'doctor', '--config', file]);
    const report = JSON.parse(stdout);
    await info.attach('doctor-report', { body: stdout, contentType: 'application/json' });
    expect(report).toMatchObject({ verdict: 'PASS', code: 'MV3_READY',
      checks: [{ name: 'manifest', passed: true }, { name: 'browser-and-worker', passed: true }] });
    expect(report.extensionId).toMatch(/^[a-p]{32}$/);
    expect(report.workerURL).toBe(`chrome-extension://${report.extensionId}/background.js`);
    expect(report.browserVersion).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('built doctor CLI reports a missing browser as INCONCLUSIVE with exit 2', async ({}, info) => {
  const dir = await mkdtemp(join(tmpdir(), 'mv3-doctor-no-browser-'));
  try {
    let failure: unknown;
    try {
      await run(process.execPath, [cli, 'doctor', '--extension', 'test-extensions/healthy-counter'], {
        env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: dir },
      });
    } catch (error) { failure = error; }
    expect(failure).toMatchObject({ code: 2 });
    const stdout = (failure as { stdout: string }).stdout;
    await info.attach('doctor-missing-browser', { body: stdout, contentType: 'application/json' });
    expect(JSON.parse(stdout)).toMatchObject({ verdict: 'INCONCLUSIVE', code: 'MV3_CHROMIUM_UNAVAILABLE' });
  } finally { await rm(dir, { recursive: true, force: true }); }
});
