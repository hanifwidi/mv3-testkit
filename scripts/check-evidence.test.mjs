import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateReport, validateEvidenceBatch } from './check-evidence.mjs';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const healthy = 'test-extensions/healthy-counter';
const broken = 'test-extensions/volatile-state-bug';
function report(fixture, runId = '12345678-1234-1234-1234-123456789abc') {
  const verdict = fixture === healthy ? 'PASS' : 'FAIL';
  return {
    schemaVersion: 1, fixture, verdict, runId, browserSource: 'playwright-bundled',
    browserVersion: '158.0.8127.18', extensionId: 'a'.repeat(32),
    driver: 'experimental-cdp-stopWorker',
    evidence: { stopped: true, runningAgain: true,
      before: { counter: 1, bootId: 'first' },
      after: { counter: fixture === healthy ? 1 : 0, bootId: 'second' } },
    timeline: [
      { event: 'message.increment' },
      { event: 'worker.stopRequested', data: { versionId: '0' } },
      { event: 'cdp.workerVersionUpdated', data: { versionId: '0', runningStatus: 'stopped' } },
      { event: 'worker.stoppedObserved', data: { versionId: '0' } },
      { event: 'message.read.trigger' },
      { event: 'cdp.workerVersionUpdated', data: { versionId: '0', runningStatus: 'running' } },
      { event: 'worker.runningAgainObserved' },
      { event: 'verdict', data: verdict },
    ],
  };
}

test('accepts correct healthy and broken reports', () => {
  validateReport(report(healthy), healthy);
  validateReport(report(broken), broken);
});
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
