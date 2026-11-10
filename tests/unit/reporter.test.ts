import { expect, it } from 'vitest';
import type { FullResult, TestCase } from '@playwright/test/reporter';
import { summarize, renderHTML, safeText, type Summary } from '../../src/reporter/index.js';

function testCase(statuses: string[], outcome = 'expected', expectedStatus = 'passed'): TestCase {
  return {
    id: 'synthetic-test-id', titlePath: () => ['synthetic test'],
    location: { file: '/project/tests/check.spec.mjs', line: 4, column: 1 },
    results: statuses.map(status => ({ status, duration: 1, stdout: ['SECRET_PAYLOAD'], errors: [{ message: 'SECRET_PAYLOAD' }] })),
    outcome: () => outcome, expectedStatus, annotations: [],
  } as unknown as TestCase;
}
const result = { status: 'passed', startTime: new Date(), duration: 1 } as FullResult;
it('keeps passed, failed, expected-failure, flaky, skipped and unrun counts separate', () => {
  const summary = summarize([
    testCase(['passed']), testCase(['failed'], 'unexpected'), testCase(['failed'], 'expected', 'failed'),
    testCase(['failed', 'passed'], 'flaky'), testCase(['skipped'], 'skipped'), testCase([]),
  ], '/project', result);
  expect(summary.counts).toEqual({ PASSED: 1, FAILED: 1, EXPECTED_FAILURE: 1, FLAKY: 1, SKIPPED: 1, UNRUN: 1 });
  expect(summary.verdict).toBe('FAIL');
});
it.each([[], [testCase(['skipped'], 'skipped')], [testCase(['failed'], 'expected', 'failed')],
  [testCase(['failed', 'passed'], 'flaky')], [testCase([])]])('does not claim PASS for unverified outcomes %j', (...tests) => {
  expect(summarize(tests as TestCase[], '/project', result).verdict).toBe('INCONCLUSIVE');
});
it('never passes a test that failed and then skipped itself on retry', () => {
  // Playwright reports [failed, skipped] with a runtime skip as outcome 'flaky' and exits 0.
  const summary = summarize([testCase(['passed']), testCase(['failed', 'skipped'], 'flaky', 'skipped')], '/project', result);
  expect(summary.counts).toMatchObject({ PASSED: 1, FLAKY: 1, SKIPPED: 0 });
  expect(summary.verdict).toBe('INCONCLUSIVE');
});
it('counts interrupted tests as unrun, not failed', () => {
  const interrupted = { ...result, status: 'interrupted' } as FullResult;
  const cancelled = summarize([testCase(['passed']), testCase(['interrupted'], 'skipped')], '/project', interrupted);
  expect(cancelled.counts).toMatchObject({ PASSED: 1, FAILED: 0, UNRUN: 1 });
  expect(cancelled.verdict).toBe('INCONCLUSIVE');
  // A maxFailures stop keeps the real failure and does not inflate it.
  const failed = { ...result, status: 'failed' } as FullResult;
  const stopped = summarize([testCase(['failed'], 'unexpected'), testCase(['interrupted'], 'skipped'),
    testCase(['interrupted'], 'skipped')], '/project', failed);
  expect(stopped.counts).toMatchObject({ FAILED: 1, UNRUN: 2 });
  expect(stopped.verdict).toBe('FAIL');
});
it('fails unexpected passes and global runner errors', () => {
  expect(summarize([testCase(['passed'], 'unexpected', 'failed')], '/project', result).verdict).toBe('FAIL');
  expect(summarize([testCase(['passed'])], '/project', result, 1).verdict).toBe('FAIL');
});
it('omits raw payloads and accepts only typed browser metadata', () => {
  const test = testCase(['passed']);
  test.annotations.push({ type: 'mv3:browserVersion', description: '158.0.8127.18' });
  test.annotations.push({ type: 'mv3:extensionId', description: '<unsafe>' });
  const summary = summarize([test], '/project', result);
  expect(JSON.stringify(summary)).not.toContain('SECRET_PAYLOAD');
  expect(summary.tests[0]).toMatchObject({ browserVersion: '158.0.8127.18', extensionId: undefined, file: 'tests/check.spec.mjs' });
});
it('redacts common secret labels/URLs and escapes HTML metadata', () => {
  for (const value of ['Authorization: Bearer private-credential', 'Cookie: theme=light; session=private-credential',
    'password=two words private-credential', '{"token":"private-credential"}', 'access_token=private-credential'])
    expect(safeText(value)).not.toContain('private-credential');
  const cleaned = safeText('token=abc password="def ghi" https://user:secret@example.com/?key=value');
  expect(cleaned).not.toMatch(/abc|def|ghi|example\.com|user:secret/);
  const test = testCase(['passed']);
  test.titlePath = () => ['<img src=x onerror=alert(1)>'];
  const summary: Summary = { schemaVersion: 1, runId: '<script>unsafe</script>', startedAt: 'start', finishedAt: 'end',
    runnerStatus: 'passed', runnerErrors: 0, ...summarize([test], '/project', result) };
  const html = renderHTML(summary);
  expect(html).not.toContain('<script>');
  expect(html).not.toContain('<img');
  expect(html).toContain('&lt;img');
});
it.each([
  'GITHUB_TOKEN=ghp_private-credential', 'NPM_TOKEN: private-credential', 'CLIENT_SECRET=private-credential',
  'DB_PASSWORD=private-credential', 'db_passwd=private-credential', 'x_api_key: private-credential',
  'authToken=private-credential', 'clientSecret: private-credential', 'SESSION_ID=private-credential',
  'postgres://admin:private-credential@db.internal/app', 'wss://user:private-credential@socket.example',
  'redis://:private-credential@cache:6379', 'DATABASE_URL=mongodb+srv://app:private-credential@cluster0',
])('redacts prefixed, camelCase and non-HTTP credential metadata: %s', value => {
  expect(safeText(value)).not.toContain('private-credential');
});
it('keeps ordinary words that merely contain a sensitive label', () => {
  const text = 'tokenizer: splits words; secretary: Ada; passwords are hashed';
  expect(safeText(text)).toBe(text);
});
it('omits the unnamed root suite and project from report titles', () => {
  const test = testCase(['passed']);
  test.titlePath = () => ['', '', 'counter.spec.mjs', 'counter survives a restart'];
  expect(summarize([test], '/project', result).tests[0].title).toBe('counter.spec.mjs › counter survives a restart');
});
it.each(['timedout', 'interrupted'] as const)('does not claim PASS when Playwright ended %s, even if every collected test passed', status => {
  expect(summarize([testCase(['passed'])], '/project', { ...result, status } as FullResult).verdict).toBe('INCONCLUSIVE');
});
it('fails a run Playwright marked failed even without a failing test or runner error', () => {
  expect(summarize([testCase(['passed'])], '/project', { ...result, status: 'failed' } as FullResult).verdict).toBe('FAIL');
});
