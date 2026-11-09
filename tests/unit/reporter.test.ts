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
