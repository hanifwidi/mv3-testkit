import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, readFile, readdir, copyFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

// Runs against an installed tarball, never source imports. Browser-free mode is
// explicitly partial verification for restricted cloud sessions.
const exec = promisify(execFile);
const tarball = resolve(process.argv[2] ?? 'artifacts/mv3-testkit-0.1.0-alpha.0.tgz');
const browser = !process.argv.includes('--no-browser');
const artifacts = resolve('artifacts');
await mkdir(artifacts, { recursive: true });
const project = await mkdtemp(join(artifacts, 'consumer-'));
const logs = join(project, 'logs');
await mkdir(logs);
const env = { ...process.env, npm_config_cache: join(project, '.npm-cache') };
async function run(label, command, args, expected = 0) {
  let stdout = '', stderr = '', code = 0;
  try {
    const result = await exec(command, args, { cwd: project, env, maxBuffer: 10 * 1024 * 1024 });
    stdout = result.stdout; stderr = result.stderr;
  } catch (error) {
    stdout = error.stdout ?? ''; stderr = error.stderr ?? ''; code = error.code;
  }
  await writeFile(join(logs, label + '.log'), stdout + '\n' + stderr);
  if (code !== expected) {
    process.stderr.write(stdout + '\n' + stderr);
    assert.equal(code, expected, `${label} returned an unexpected exit code`);
  }
  console.log(`${label}: exit ${code} (expected ${expected})`);
  return { stdout, stderr };
}
await writeFile(join(project, 'package.json'), JSON.stringify({ name: 'mv3-local-consumer', private: true, type: 'module',
  devDependencies: { 'mv3-testkit': 'file:' + tarball, '@playwright/test': '1.65.0' } }, null, 2));
await run('install', 'npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund']);
const require = createRequire(join(project, 'package.json'));
const root = dirname(require.resolve('mv3-testkit/package.json'));
const cli = join(root, 'bin/mv3tk.mjs');
const example = join(root, 'examples/vanilla-mv3');
const invoke = (label, args, code = 0) => run(label, process.execPath, [cli, ...args], code);
await run('installed-bin-help', join(project, 'node_modules/.bin/mv3tk'), ['--help']);
await invoke('help', ['--help']);
await invoke('init', ['init', '--extension', example]);
const original = await readFile(join(project, 'mv3-testkit.config.json'), 'utf8');
await invoke('init-preserves-files', ['init', '--extension', example], 1);
assert.equal(await readFile(join(project, 'mv3-testkit.config.json'), 'utf8'), original);

async function summary(reportRoot) {
  const entries = await readdir(join(project, reportRoot));
  assert.equal(entries.length, 1, 'Expected exactly one fresh report directory');
  const directory = join(project, reportRoot, entries[0]);
  assert((await readFile(join(directory, 'index.html'), 'utf8')).startsWith('<!doctype html>'));
  return JSON.parse(await readFile(join(directory, 'summary.json'), 'utf8'));
}

const config = join(project, 'controls.config.mjs');
await writeFile(config, "export default { testDir: './controls', workers: 1, retries: 0 };\n");
await mkdir(join(project, 'controls'));
await writeFile(join(project, 'controls', 'controls.spec.mjs'), `import { test, expect } from '@playwright/test';
test('positive control', () => expect(2 + 2).toBe(4));
test('negative control', () => expect('negative-control-marker').toBe('must-fail'));
test.skip('skip-only control', () => {});
`);
await invoke('runner-positive', ['test', '--config', config, '--grep', 'positive control$', '--report-dir', 'positive-reports']);
assert.equal((await summary('positive-reports')).counts.PASSED, 1);
const negative = await invoke('runner-negative', ['test', '--config', config, '--grep', 'negative control$', '--report-dir', 'negative-reports'], 1);
assert.match(negative.stdout + negative.stderr, /negative-control-marker/);
assert.equal((await summary('negative-reports')).counts.FAILED, 1);
await invoke('runner-all-skipped', ['test', '--config', config, '--grep', 'skip-only control$', '--report-dir', 'skipped-reports'], 2);
assert.equal((await summary('skipped-reports')).verdict, 'INCONCLUSIVE');

// Deliberate retry control: a recovered failure plus a stable pass must still be
// reported as INCONCLUSIVE, not disguised as a clean successful run.
await mkdir(join(project, 'flaky-controls'));
await writeFile(join(project, 'flaky.config.mjs'), "export default { testDir: './flaky-controls', workers: 1, retries: 1 };\n");
await writeFile(join(project, 'flaky-controls', 'retry.spec.mjs'), `import { test, expect } from '@playwright/test';
test('stable control', () => expect(1).toBe(1));
test('deliberate retry control', async ({}, info) => expect(info.retry).toBeGreaterThan(0));
`);
await invoke('runner-flaky', ['test', '--config', 'flaky.config.mjs', '--report-dir', 'flaky-reports'], 2);
const flaky = await summary('flaky-reports');
assert.equal(flaky.counts.FLAKY, 1);
assert.equal(flaky.counts.PASSED, 1);
assert.equal(flaky.verdict, 'INCONCLUSIVE');

let browserResult = 'NOT_RUN';
if (browser) {
  const readiness = await invoke('doctor-browser', ['doctor', '--config', 'mv3-testkit.config.json']);
  assert.equal(JSON.parse(readiness.stdout).code, 'MV3_READY');
  await copyFile(join(example, 'tests/mv3/counter.spec.mjs'), join(project, 'tests/mv3/counter.spec.mjs'));
  await invoke('installed-browser-workflows', ['test', '--report-dir', 'browser-reports']);
  const report = await summary('browser-reports');
  assert.equal(report.verdict, 'PASS');
  assert.equal(report.counts.PASSED, 2, 'Generated smoke test and first-party UI/restart test must both execute');
  for (const test of report.tests) {
    assert.match(test.browserVersion, /^\d+\.\d+\.\d+\.\d+$/);
    assert.match(test.extensionId, /^[a-p]{32}$/);
  }
  browserResult = 'PASS';
}
const record = { tarball, project, browser: browserResult,
  controls: { positive: 'PASS', negativeExit: 1, skippedExit: 2, flakyExit: 2 },
  note: 'Control-suite failures/skips are deliberate verification of CLI behavior, not disabled product tests.' };
await writeFile(join(artifacts, browser ? 'consumer-smoke.json' : 'consumer-smoke-no-browser.json'), JSON.stringify(record, null, 2) + '\n');
console.log(JSON.stringify(record));
