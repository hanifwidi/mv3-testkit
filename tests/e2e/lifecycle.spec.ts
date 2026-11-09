import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium, test, expect } from '@playwright/test';
import { recordedProbe } from './helpers.js';

test('healthy counter survives an observed worker stop and message reactivation', async ({}, info) => {
  const report = await recordedProbe('healthy-counter', info);
  expect(report, JSON.stringify(report, null, 2)).toMatchObject({
    verdict: 'PASS', evidence: { stopped: true, runningAgain: true, before: { counter: 1 }, after: { counter: 1 } },
  });
  expect(report.evidence.after?.bootId).not.toBe(report.evidence.before?.bootId);
});

test('detector diagnoses the intentionally broken in-memory counter as FAIL', async ({}, info) => {
  const report = await recordedProbe('volatile-state-bug', info);
  expect(report, JSON.stringify(report, null, 2)).toMatchObject({
    verdict: 'FAIL', evidence: { stopped: true, runningAgain: true, before: { counter: 1 }, after: { counter: 0 } },
  });
  expect(report.evidence.after?.bootId).not.toBe(report.evidence.before?.bootId);
});

test('content script messages the worker in its isolated world and updates host DOM', async () => {
  const server = createServer((_req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.end('<!doctype html><html lang="en"><title>Local MV3 fixture</title><body>Fixture</body></html>');
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const profile = await mkdtemp(join(tmpdir(), 'mv3-testkit-dom-'));
  let context;
  try {
    const path = resolve('test-extensions/healthy-counter');
    context = await chromium.launchPersistentContext(profile, {
      channel: 'chromium', headless: process.env.HEADED !== '1',
      executablePath: process.env.POC_CHROMIUM_PATH,
      ignoreDefaultArgs: ['--disable-extensions'],
      args: [`--disable-extensions-except=${path}`, `--load-extension=${path}`],
    });
    const page = await context.newPage();
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing fixture server port');
    await page.goto(`http://127.0.0.1:${address.port}`);
    await expect(page.locator('html')).toHaveAttribute('data-mv3-counter', '0');
    // A website main world is not the extension content-script world.
    expect(await page.evaluate(() => typeof chrome.runtime?.id)).toBe('undefined');
  } finally {
    await context?.close();
    await rm(profile, { recursive: true, force: true });
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
