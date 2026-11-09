import { launchExtension, type LaunchOptions } from './loader.js';
import { diagnoseError } from './errors.js';
import { inspectExtension } from './manifest.js';
import type { Diagnostic } from './diagnostics.js';

export interface DoctorReport extends Diagnostic {
  schemaVersion: 1;
  checkedAt: string;
  extensionPath: string;
  checks: { name: 'manifest' | 'browser-and-worker'; passed: boolean }[];
  browserVersion?: string;
  extensionId?: string;
  workerURL?: string;
}

/** A PASS verifies actual browser launch and worker discovery, never just a PID. */
export async function doctor(options: LaunchOptions): Promise<DoctorReport> {
  const checks: DoctorReport['checks'] = [];
  const report: DoctorReport = {
    schemaVersion: 1, checkedAt: new Date().toISOString(), extensionPath: options.extensionPath,
    verdict: 'INCONCLUSIVE', code: 'MV3_DOCTOR_NOT_COMPLETED', message: 'Doctor has not completed', checks,
  };
  let extension: Awaited<ReturnType<typeof launchExtension>> | undefined;
  try {
    await inspectExtension(options.extensionPath);
    checks.push({ name: 'manifest', passed: true });
    extension = await launchExtension(options);
    checks.push({ name: 'browser-and-worker', passed: true });
    report.browserVersion = extension.context.browser()?.version();
    report.extensionId = extension.id;
    report.workerURL = extension.workerURL;
    Object.assign(report, { verdict: 'PASS', code: 'MV3_READY', message: 'Manifest, Chromium launch and extension worker discovery verified' });
  } catch (error) {
    checks.push({ name: checks.length ? 'browser-and-worker' : 'manifest', passed: false });
    Object.assign(report, diagnoseError(error));
  } finally {
    try { await extension?.close(); }
    catch (error) {
      Object.assign(report, { verdict: 'INCONCLUSIVE', code: 'MV3_CLEANUP_FAILED',
        message: error instanceof Error ? error.message : String(error) });
    }
  }
  return report;
}
