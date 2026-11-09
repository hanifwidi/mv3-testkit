import { writeFile } from 'node:fs/promises';
import { test, type TestInfo } from '@playwright/test';
import { probe, type Report } from '../../src/probe.js';

export async function recordedProbe(fixture: string, info: TestInfo): Promise<Report> {
  const report = await test.step(`Real Chromium lifecycle: ${fixture}`, () =>
    probe(`test-extensions/${fixture}`));
  report.testId = info.testId;
  const body = JSON.stringify(report, null, 2);
  await writeFile(info.outputPath('evidence.json'), body + '\n');
  await info.attach('lifecycle-evidence', { body, contentType: 'application/json' });
  console.log(JSON.stringify({ fixture, verdict: report.verdict, browserVersion: report.browserVersion,
    before: report.evidence.before, after: report.evidence.after, error: report.error }));
  return report;
}
