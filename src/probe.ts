import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { chromium, type BrowserContext, type CDPSession, type Page } from '@playwright/test';
import { verdict, type Observations, type Verdict } from './verdict.js';

interface Version {
  versionId: string;
  scriptURL: string;
  runningStatus: string;
}

export interface Report {
  schemaVersion: 1;
  runId: string;
  testId?: string;
  fixture: string;
  startedAt: string;
  browserVersion?: string;
  browserSource: 'playwright-bundled' | 'explicit-override';
  extensionId?: string;
  driver: 'experimental-cdp-stopWorker';
  verdict: Verdict;
  evidence: Observations;
  timeline: { at: string; event: string; data?: unknown }[];
  error?: { phase: string; message: string };
}

// Attach to a PAGE, never the worker debugger: worker debugging can affect lifetime.
class WorkerObserver {
  private versions = new Map<string, Version>();
  private listeners = new Set<() => void>();
  constructor(private session: CDPSession, scriptURL: string, log: (event: string, data?: unknown) => void) {
    session.on('ServiceWorker.workerVersionUpdated', ({ versions }) => {
      for (const version of versions) {
        if (version.scriptURL !== scriptURL) continue;
        this.versions.set(version.versionId, version);
        log('cdp.workerVersionUpdated', {
          versionId: version.versionId,
          scriptURL: version.scriptURL,
          runningStatus: version.runningStatus,
        });
      }
      for (const listener of this.listeners) listener();
    });
  }

  async enable() { await this.session.send('ServiceWorker.enable'); }

  waitFor(scriptURL: string, status: string, versionId?: string): Promise<Version> {
    return new Promise((accept, reject) => {
      const check = () => {
        const match = [...this.versions.values()].find((v) =>
          v.scriptURL === scriptURL && v.runningStatus === status &&
          (!versionId || v.versionId === versionId));
        if (match) { cleanup(); accept(match); }
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`MV3_WORKER_TRANSITION_UNVERIFIED: no ${status} event for ${scriptURL}`));
      }, 10_000);
      const cleanup = () => { clearTimeout(timer); this.listeners.delete(check); };
      this.listeners.add(check);
      check();
    });
  }
}

async function withDeadline<T>(operation: Promise<T>, description: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`MV3_OPERATION_TIMEOUT: ${description}`)), 10_000);
      }),
    ]);
  } finally { clearTimeout(timer); }
}

async function message(page: Page, type: 'read' | 'increment') {
  const reply: unknown = await withDeadline(page.evaluate(async (type) => {
    // This is our explicit test-only extension document, not a website main world.
    return chrome.runtime.sendMessage({ type });
  }, type), `runtime.sendMessage(${type})`);
  if (!reply || typeof reply !== 'object' ||
    !('counter' in reply) || typeof reply.counter !== 'number' ||
    !Number.isSafeInteger(reply.counter) || !('bootId' in reply) ||
    typeof reply.bootId !== 'string' || !reply.bootId)
    throw new Error(`MV3_MESSAGE_INVALID: expected counter and bootId, received ${JSON.stringify(reply)}`);
  return { counter: reply.counter, bootId: reply.bootId };
}

/** Phase 0 research harness, not a public library API. Uses only trusted test fixtures. */
export async function probe(extensionPath: string): Promise<Report> {
  const evidence: Observations = { stopped: false, runningAgain: false };
  const report: Report = {
    schemaVersion: 1, runId: randomUUID(), fixture: extensionPath, startedAt: new Date().toISOString(),
    browserSource: process.env.POC_CHROMIUM_PATH ? 'explicit-override' : 'playwright-bundled',
    driver: 'experimental-cdp-stopWorker', verdict: 'INCONCLUSIVE', evidence, timeline: [],
  };
  const log = (event: string, data?: unknown) => {
    report.timeline.push({ at: new Date().toISOString(), event, data });
  };
  let phase = 'manifest';
  let context: BrowserContext | undefined;
  let profile: string | undefined;
  try {
    const path = resolve(extensionPath);
    const manifest = JSON.parse(await readFile(join(path, 'manifest.json'), 'utf8'));
    if (manifest.manifest_version !== 3 || manifest.background?.service_worker !== 'background.js')
      throw new Error('POC requires Manifest V3 with background.js');
    phase = 'launch';
    profile = await mkdtemp(join(tmpdir(), 'mv3-testkit-'));
    context = await chromium.launchPersistentContext(profile, {
      channel: 'chromium', headless: process.env.HEADED !== '1', timeout: 15_000,
      executablePath: process.env.POC_CHROMIUM_PATH,
      ignoreDefaultArgs: ['--disable-extensions'],
      args: [`--disable-extensions-except=${path}`, `--load-extension=${path}`],
    });
    context.setDefaultTimeout(10_000);
    report.browserVersion = context.browser()?.version();
    log('browser.launched', { version: report.browserVersion });
    phase = 'discovery';
    const isFixtureWorker = (url: string) => /^chrome-extension:\/\/[a-p]{32}\/background\.js$/.test(url);
    const worker = context.serviceWorkers().find((w) => isFixtureWorker(w.url())) ??
      await context.waitForEvent('serviceworker', { predicate: (w) => isFixtureWorker(w.url()), timeout: 10_000 });
    const scriptURL = worker.url();
    report.extensionId = new URL(scriptURL).hostname;
    log('worker.discovered', { scriptURL });
    const page = await context.newPage();
    await page.goto(`chrome-extension://${report.extensionId}/probe.html`);
    const session = await context.newCDPSession(page);
    const observer = new WorkerObserver(session, scriptURL, log);
    await withDeadline(observer.enable(), 'CDP ServiceWorker.enable');
    const initial = await observer.waitFor(scriptURL, 'running');
    phase = 'baseline';
    const zero = await message(page, 'read');
    if (zero.counter !== 0) throw new Error('Fresh profile did not start with counter zero');
    evidence.before = await message(page, 'increment');
    if (evidence.before.counter !== 1) throw new Error('Increment did not produce counter one');
    log('message.increment', evidence.before);
    // Read the single fixture-owned key, never dump arbitrary extension storage.
    log('storage.before', await withDeadline(page.evaluate(() => chrome.storage.local.get('counter')), 'storage before'));
    phase = 'stop';
    log('worker.stopRequested', { versionId: initial.versionId });
    await withDeadline(session.send('ServiceWorker.stopWorker', { versionId: initial.versionId }), 'CDP stopWorker');
    await observer.waitFor(scriptURL, 'stopped', initial.versionId);
    evidence.stopped = true;
    log('worker.stoppedObserved', { versionId: initial.versionId });
    phase = 'reactivate';
    log('message.read.trigger');
    evidence.after = await message(page, 'read');
    await observer.waitFor(scriptURL, 'running', initial.versionId);
    evidence.runningAgain = true;
    log('worker.runningAgainObserved', evidence.after);
    log('storage.after', await withDeadline(page.evaluate(() => chrome.storage.local.get('counter')), 'storage after'));
    report.verdict = verdict(evidence);
    log('verdict', report.verdict);
  } catch (error) {
    report.error = { phase, message: error instanceof Error ? error.message : String(error) };
    // Infrastructure/unsupported transitions are inconclusive, not a diagnosed state bug.
    log('error', report.error);
  } finally {
    try { await context?.close(); }
    catch (error) {
      report.verdict = 'INCONCLUSIVE';
      report.error = { phase: 'cleanup', message: String(error) };
      log('error', report.error);
    }
    try {
      if (profile) await rm(profile, { recursive: true, force: true });
      log('profile.removed');
    } catch (error) {
      report.verdict = 'INCONCLUSIVE';
      report.error = { phase: 'profile-cleanup', message: String(error) };
      log('error', report.error);
    }
  }
  return report;
}
