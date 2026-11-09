import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const EXPECTED = {
  'test-extensions/healthy-counter': { verdict: 'PASS', after: 1 },
  'test-extensions/volatile-state-bug': { verdict: 'FAIL', after: 0 },
};

export function validateReport(report, fixture) {
  const spec = EXPECTED[fixture];
  assert.ok(spec, `Unknown fixture ${fixture}`);
  assert.equal(report?.schemaVersion, 1);
  assert.equal(report.fixture, fixture);
  assert.equal(report.verdict, spec.verdict);
  assert.equal(report.error, undefined, 'Infrastructure or cleanup error is not evidence');
  assert.equal(report.browserSource, 'playwright-bundled');
  assert.equal(report.driver, 'experimental-cdp-stopWorker');
  assert.match(report.browserVersion ?? '', /^\d+\.\d+\.\d+\.\d+$/);
  assert.match(report.extensionId ?? '', /^[a-p]{32}$/);
  assert.match(report.runId ?? '', /^[0-9a-f-]{20,}$/i);
  assert.equal(report.evidence?.stopped, true);
  assert.equal(report.evidence?.runningAgain, true);
  assert.equal(report.evidence?.before?.counter, 1);
  assert.equal(report.evidence?.after?.counter, spec.after);
  assert.ok(report.evidence.before.bootId, 'Missing initial boot identity');
  assert.ok(report.evidence.after.bootId, 'Missing restarted boot identity');
  assert.notEqual(report.evidence.before.bootId, report.evidence.after.bootId);

  const timeline = report.timeline;
  assert.ok(Array.isArray(timeline), 'Missing timeline');
  const afterEvent = (event, after = -1) => timeline.findIndex((entry, i) => i > after && entry.event === event);
  const increment = afterEvent('message.increment');
  const requested = afterEvent('worker.stopRequested', increment);
  const stopped = afterEvent('worker.stoppedObserved', requested);
  const trigger = afterEvent('message.read.trigger', stopped);
  const resumed = afterEvent('worker.runningAgainObserved', trigger);
  const decision = afterEvent('verdict', resumed);
  assert.ok([increment, requested, stopped, trigger, resumed, decision].every(i => i >= 0),
    'Missing or out-of-order lifecycle events');
  const version = timeline[requested].data?.versionId;
  assert.ok(version, 'Missing selected worker versionId');
  assert.equal(timeline[stopped].data?.versionId, version);
  assert.equal(timeline[decision].data, spec.verdict);
  const updates = timeline.filter(entry => entry.event === 'cdp.workerVersionUpdated');
  assert.ok(updates.some(e => e.data?.versionId === version && e.data?.runningStatus === 'stopped'),
    'Missing CDP stopped observation');
  assert.ok(updates.some(e => e.data?.versionId === version && e.data?.runningStatus === 'running'),
    'Missing CDP running observation');
}

async function collect(root) {
  const reports = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile() && entry.name === 'evidence.json') {
        reports.push(JSON.parse(await readFile(path, 'utf8')));
      }
    }
  }
  await walk(root);
  return reports;
}

export async function validateEvidenceBatch(proofDir, repeats, negativeDir) {
  assert.ok(Number.isSafeInteger(repeats) && repeats > 0, 'Repeat count must be positive integer');
  const reports = await collect(proofDir);
  assert.equal(reports.length, repeats * 2, 'Expected exactly two lifecycle reports per repetition');
  const counts = new Map(Object.keys(EXPECTED).map(fixture => [fixture, 0]));
  const ids = new Set();
  for (const report of reports) {
    validateReport(report, report.fixture);
    assert.ok(!ids.has(report.runId), 'Duplicate run ID');
    ids.add(report.runId);
    counts.set(report.fixture, counts.get(report.fixture) + 1);
  }
  for (const [fixture, count] of counts) assert.equal(count, repeats, `Wrong repeat count for ${fixture}`);
  if (negativeDir) {
    const negatives = await collect(negativeDir);
    assert.equal(negatives.length, 1, 'Expected exactly one negative-control report');
    validateReport(negatives[0], 'test-extensions/volatile-state-bug');
    assert.ok(!ids.has(negatives[0].runId), 'Negative control reused normal test runId');
  }
  return { proofReports: reports.length, negativeReports: negativeDir ? 1 : 0 };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [proofDir, repeatText, negativeDir] = process.argv.slice(2);
  validateEvidenceBatch(proofDir, Number(repeatText), negativeDir)
    .then(value => console.log(`Verified lifecycle evidence: ${JSON.stringify(value)}`))
    .catch(error => { console.error(error); process.exitCode = 1; });
}
