// Used after the intentionally failing project: a nonzero exit alone is insufficient.
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const root = process.argv[2];
assert(root, 'Usage: node scripts/check-negative.mjs <negative-project-output-directory>');
const reports = [];
async function walk(path) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) await walk(child);
    else if (entry.name === 'evidence.json') reports.push(JSON.parse(await readFile(child, 'utf8')));
  }
}
await walk(root);
assert.equal(reports.length, 1, 'Expected exactly one fresh negative-control report');
const [report] = reports;
assert.equal(report.error, undefined);
assert.equal(report.browserSource, 'playwright-bundled', 'System-browser explorations do not satisfy the gate');
assert.equal(report.fixture, 'test-extensions/volatile-state-bug');
assert.equal(report.verdict, 'FAIL');
assert.equal(report.evidence.stopped, true);
assert.equal(report.evidence.runningAgain, true);
assert.equal(report.evidence.before.counter, 1);
assert.equal(report.evidence.after.counter, 0);
assert.notEqual(report.evidence.before.bootId, report.evidence.after.bootId);
console.log('Confirmed: the negative-control failure is real state loss after an observed restart.');
