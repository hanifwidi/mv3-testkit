import { writeFile } from 'node:fs/promises';
import type { TestInfo } from '@playwright/test';
import { forceWorkerRestart, diagnoseError } from '../../src/core/index.js';

/** Test-owned logging of phase/event metadata; never dumps extension storage. */
export async function recordedRestart(options: Parameters<typeof forceWorkerRestart>[0], info: TestInfo) {
  let report: unknown;
  try {
    const evidence = await forceWorkerRestart({ ...options, testId: info.testId });
    report = { observation: 'STOP_AND_RESTART_VERIFIED', evidence };
    return evidence;
  } catch (error) {
    report = diagnoseError(error);
    throw error;
  } finally {
    const body = JSON.stringify(report, null, 2);
    await writeFile(info.outputPath('lifecycle-evidence.json'), body + '\n');
    await info.attach('phase2-worker-restart', { body, contentType: 'application/json' });
  }
}
