import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateReport, validateEvidenceBatch, PINNED_CHROMIUM_VERSION } from './check-evidence.mjs';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const healthy = 'test-extensions/healthy-counter';
const broken = 'test-extensions/volatile-state-bug';
const scriptURL = `chrome-extension://${'a'.repeat(32)}/background.js`;
function report(fixture, runId = '12345678-1234-1234-1234-123456789abc') {
  const verdict = fixture === healthy ? 'PASS' : 'FAIL';
  return {
    schemaVersion: 1, fixture, verdict, runId, browserSource: 'playwright-bundled',
    browserVersion: PINNED_CHROMIUM_VERSION, extensionId: 'a'.repeat(32),
    driver: 'experimental-cdp-stopWorker',
    evidence: { stopped: true, runningAgain: true,
      before: { counter: 1, bootId: 'first' },
      after: { counter: fixture === healthy ? 1 : 0, bootId: 'second' } },
    timeline: [
      { event: 'message.increment' },
      { event: 'worker.stopRequested', data: { versionId: '0' } },
      { event: 'cdp.workerVersionUpdated', data: { versionId: '0', scriptURL, runningStatus: 'stopped' } },
      { event: 'worker.stoppedObserved', data: { versionId: '0' } },
      { event: 'message.read.trigger' },
      { event: 'cdp.workerVersionUpdated', data: { versionId: '0', scriptURL, runningStatus: 'running' } },
      { event: 'worker.runningAgainObserved' },
      { event: 'verdict', data: verdict },
    ],
  };
}

test('accepts correct healthy and broken reports', () => {
  validateReport(report(healthy), healthy);
  validateReport(report(broken), broken);
});
for (const fixture of [healthy, broken]) {
  test(`accepts a bootstrap running event followed by a real restart: ${fixture}`, () => {
    const r = report(fixture);
    r.timeline.unshift(structuredClone(r.timeline[5]));
    validateReport(r, fixture);
  });
  for (const [name, status, destination] of [
    ['bootstrap running event alone', 'running', 'message.increment'],
    ['running event before wake-up message', 'running', 'message.read.trigger'],
    ['running event after claimed recovery', 'running', 'verdict'],
    ['stopped event before stop request', 'stopped', 'worker.stopRequested'],
    ['stopped event after claimed stop', 'stopped', 'message.read.trigger'],
  ]) {
    test(`rejects ${name}: ${fixture}`, () => {
      const r = report(fixture);
      const index = r.timeline.findIndex(entry => entry.data?.runningStatus === status);
      const [update] = r.timeline.splice(index, 1);
      r.timeline.splice(r.timeline.findIndex(entry => entry.event === destination), 0, update);
      assert.throws(() => validateReport(r, fixture), /CDP.*observation/);
    });
  }
  test(`rejects CDP observations from another extension: ${fixture}`, () => {
    const r = report(fixture);
    r.timeline[5].data.scriptURL = `chrome-extension://${'b'.repeat(32)}/background.js`;
    assert.throws(() => validateReport(r, fixture), /CDP.*observation/);
  });
}
test('rejects a missing worker restart', () => {
  const r = report(healthy); r.timeline.splice(6, 1);
  assert.throws(() => validateReport(r, healthy), /Missing or out-of-order/);
});
test('rejects unchanged boot identity', () => {
  const r = report(healthy); r.evidence.after.bootId = 'first';
  assert.throws(() => validateReport(r, healthy));
});
test('rejects mismatched CDP version ID', () => {
  const r = report(broken); r.timeline[3].data.versionId = 'other';
  assert.throws(() => validateReport(r, broken));
});
test('rejects infrastructure errors even when verdict says FAIL', () => {
  const r = report(broken); r.error = { phase: 'launch', message: 'no browser' };
  assert.throws(() => validateReport(r, broken));
});
test('pins the Chromium build of the installed Playwright', () => {
  // Playwright 1.65.0 pins Chrome for Testing 158.0.8127.18 (revision 1254).
  assert.match(PINNED_CHROMIUM_VERSION, /^\d+\.\d+\.\d+\.\d+$/);
  // A relocated PLAYWRIGHT_BROWSERS_PATH holding another build still reports
  // browserSource "playwright-bundled"; the version must expose the substitution.
  const r = report(healthy); r.browserVersion = '153.0.8010.12';
  assert.throws(() => validateReport(r, healthy), /pinned by the installed Playwright/);
});
test('requires two distinct reports and one fresh negative control', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mv3-evidence-test-'));
  const proof = join(dir, 'proof'), negative = join(dir, 'negative');
  try {
    await mkdir(proof); await mkdir(negative);
    await mkdir(join(proof, 'a')); await mkdir(join(proof, 'b'));
    await mkdir(join(negative, 'c'));
    await writeFile(join(proof, 'a', 'evidence.json'), JSON.stringify(report(healthy)));
    await writeFile(join(proof, 'b', 'evidence.json'), JSON.stringify(report(broken, 'aaaaaaaa-1234-1234-1234-123456789abc')));
    await writeFile(join(negative, 'c', 'evidence.json'), JSON.stringify(report(broken, 'bbbbbbbb-1234-1234-1234-123456789abc')));
    assert.deepEqual(await validateEvidenceBatch(proof, 1, negative), { proofReports: 2, negativeReports: 1 });
    await writeFile(join(proof, 'b', 'evidence.json'), JSON.stringify(report(broken)));
    await assert.rejects(validateEvidenceBatch(proof, 1, negative), /Duplicate run ID/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('standalone negative checker accepts real restart evidence and rejects a stale running event', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mv3-negative-validator-test-'));
  const checker = fileURLToPath(new URL('./check-negative.mjs', import.meta.url));
  const run = () => promisify(execFile)(process.execPath, [checker, dir]);
  try {
    const r = report(broken);
    const path = join(dir, 'evidence.json');
    await writeFile(path, JSON.stringify(r));
    const result = await run();
    assert.match(result.stdout, /Confirmed/);
    const [running] = r.timeline.splice(5, 1);
    r.timeline.unshift(running);
    await writeFile(path, JSON.stringify(r));
    await assert.rejects(run(), error => error.code === 1 && /CDP running observation/.test(error.stderr));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
