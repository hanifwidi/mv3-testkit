import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { relative, basename, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { FullConfig, FullResult, Reporter, Suite, TestCase } from '@playwright/test/reporter';

export type ReportStatus = 'PASSED' | 'FAILED' | 'EXPECTED_FAILURE' | 'FLAKY' | 'SKIPPED' | 'UNRUN';
export interface TestSummary {
  testId: string; title: string; file: string; line: number;
  status: ReportStatus; attempts: number; durationMs: number;
  browserVersion?: string; extensionId?: string;
}
export interface Summary {
  schemaVersion: 1; runId: string; startedAt: string; finishedAt: string;
  runnerStatus: FullResult['status']; verdict: 'PASS' | 'FAIL' | 'INCONCLUSIVE';
  runnerErrors: number; counts: Record<ReportStatus, number>; tests: TestSummary[];
}

// Any scheme, not only http(s): postgres://, redis://, wss:// etc. carry user:password@ credentials.
// The lookbehinds start matches only at the beginning of a scheme/identifier,
// which keeps matching linear on long names (redaction runs before truncation).
const URL_PATTERN = /(?<![a-z0-9+.-])[a-z][a-z0-9+.-]*:\/\/[^\s)]+/gi;
// A sensitive label may be a whole identifier or end one: token, GITHUB_TOKEN, clientSecret, x-api-key.
const SECRET_ASSIGNMENT =
  /(?<![A-Za-z0-9_-])([A-Za-z0-9_-]*(?:token|secret|passw(?:or)?d|authorization|cookie|api[_-]?key|private[_-]?key|session[_-]?id|credentials?))["']?\s*[:=][^\r\n]*/gi;

/** Whitelisted metadata only; stdout, errors, attachments and storage are omitted. */
export function safeText(text: string): string {
  return text.replace(URL_PATTERN, '[url]')
    // Consume the rest of the metadata line, including Bearer/Basic credentials,
    // multi-cookie headers and multiword values. Over-redaction is intentional.
    .replace(SECRET_ASSIGNMENT, '$1=[redacted]')
    .slice(0, 500);
}
function classify(test: TestCase): ReportStatus {
  const last = test.results.at(-1);
  if (!last) return 'UNRUN';
  // Playwright's outcome covers every attempt: a test that failed and then
  // skipped itself on retry is 'flaky', so it must not be counted as SKIPPED.
  const outcome = test.outcome();
  if (outcome === 'unexpected') return 'FAILED';
  if (outcome === 'flaky') return 'FLAKY';
  // Interrupted (Ctrl+C, CI cancellation, a maxFailures stop) did not fail.
  if (last.status === 'interrupted') return 'UNRUN';
  if (last.status === 'skipped') return 'SKIPPED';
  if (test.expectedStatus === 'failed' && outcome === 'expected') return 'EXPECTED_FAILURE';
  return last.status === 'passed' ? 'PASSED' : 'FAILED';
}
export function summarize(tests: readonly TestCase[], root: string, result: FullResult, runnerErrors = 0): Pick<Summary, 'verdict' | 'counts' | 'tests'> {
  const counts: Summary['counts'] = { PASSED: 0, FAILED: 0, EXPECTED_FAILURE: 0, FLAKY: 0, SKIPPED: 0, UNRUN: 0 };
  const summaries = tests.map(test => {
    const status = classify(test);
    counts[status]++;
    const path = relative(root, test.location.file);
    const annotation = (type: string, pattern: RegExp) => {
      const value = test.annotations.find(a => a.type === type)?.description;
      return value && pattern.test(value) ? value : undefined;
    };
    return {
      // titlePath() starts with the unnamed root suite (and an unnamed project when
      // the config defines none); drop empty segments instead of rendering " ›  › ".
      testId: safeText(test.id), title: safeText(test.titlePath().filter(Boolean).join(' › ')),
      file: safeText(path.startsWith('..') ? basename(test.location.file) : path), line: test.location.line,
      status, attempts: test.results.length, durationMs: test.results.reduce((n, r) => n + r.duration, 0),
      browserVersion: annotation('mv3:browserVersion', /^\d+\.\d+\.\d+\.\d+$/),
      extensionId: annotation('mv3:extensionId', /^[a-p]{32}$/),
    };
  });
  const verdict = counts.FAILED || runnerErrors || result.status === 'failed' ? 'FAIL' :
    result.status !== 'passed' || !counts.PASSED || counts.FLAKY || counts.UNRUN ? 'INCONCLUSIVE' : 'PASS';
  return { verdict, counts, tests: summaries };
}
function escapeHTML(text: string): string {
  return text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
export function renderHTML(summary: Summary): string {
  const rows = summary.tests.map(t => `<tr><td>${escapeHTML(t.title)}</td><td>${t.status}</td><td>${escapeHTML(t.file)}:${t.line}</td><td>${t.attempts}</td></tr>`).join('\n');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>MV3 TestKit report</title>
<style>body{font:16px system-ui;max-width:1000px;margin:3rem auto;padding:0 1rem}table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:.7rem;border-bottom:1px solid #bbb}code{word-break:break-all}</style>
<h1>MV3 TestKit: ${summary.verdict}</h1><p>Run <code>${escapeHTML(summary.runId)}</code></p>
<p>${escapeHTML(summary.startedAt)} — ${escapeHTML(summary.finishedAt)}</p>
<p>${Object.entries(summary.counts).map(([k, v]) => `${k}: ${v}`).join(' · ')}</p>
<p>Runner errors: ${summary.runnerErrors}. Raw output, error payloads, attachments and storage are excluded. Use the terminal to diagnose failures. Skipped or expected-failure cases are not passed tests.</p>
<table><thead><tr><th>Test</th><th>Result</th><th>Source</th><th>Attempts</th></tr></thead><tbody>${rows}</tbody></table></html>`;
}

export default class MV3Reporter implements Reporter {
  private config?: FullConfig;
  private suite?: Suite;
  private startedAt = new Date().toISOString();
  private errors = 0;
  constructor(private options: { outputDir?: string } = {}) {}
  onBegin(config: FullConfig, suite: Suite) { this.config = config; this.suite = suite; }
  onError() { this.errors++; }
  async onEnd(result: FullResult) {
    const calculated = summarize(this.suite?.allTests() ?? [], this.config?.rootDir ?? process.cwd(), result, this.errors);
    const summary: Summary = { schemaVersion: 1, runId: process.env.MV3TK_RUN_ID ?? randomUUID(),
      startedAt: this.startedAt, finishedAt: new Date().toISOString(), runnerStatus: result.status,
      runnerErrors: this.errors, ...calculated };
    let dir = process.env.MV3TK_REPORT_DIR;
    if (!dir) {
      const root = resolve(this.options.outputDir ?? 'mv3-reports');
      await mkdir(root, { recursive: true });
      dir = await mkdtemp(join(root, 'run-'));
    }
    // CLI-owned fresh directories; never overwrite an existing report.
    await writeFile(join(dir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n', { flag: 'wx' });
    await writeFile(join(dir, 'index.html'), renderHTML(summary), { flag: 'wx' });
  }
}
